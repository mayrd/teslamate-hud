import { TeslaData } from '../types.ts';

// Each keyframe defines the full target state at a given time (seconds)
// Values are linearly interpolated between keyframes every 100ms

export interface DemoKeyframe {
    t: number; // time in seconds
    data: Partial<TeslaData>;
    label: string; // human-readable scene description
}

const TOMORROW_NOON = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(12, 35, 0, 0);
    return d.toISOString();
})();

export const DEMO_KEYFRAMES: DemoKeyframe[] = [
    // ── Scene 1: Parked at home ──────────────────────────────────────────────
    {
        t: 0,
        label: 'Parked – full battery',
        data: {
            speed: 0, power: 0, gear: 'P',
            batteryLevel: 88, range: 410,
            outsideTemp: 4, insideTemp: 19,
            heading: 0, state: 'online',
            destination: '', activeRoute: null,
        },
    },
    // ── Scene 2: Shift D, accelerate – city driving ──────────────────────────
    {
        t: 5,
        label: 'City driving',
        data: {
            speed: 0, power: 0, gear: 'D',
            batteryLevel: 88, range: 410,
            outsideTemp: 4, heading: 42,
            destination: '', activeRoute: null,
        },
    },
    {
        t: 8,
        label: 'City driving – accelerating',
        data: {
            speed: 52, power: 45, gear: 'D',
            batteryLevel: 87, range: 408,
            outsideTemp: 4, heading: 42,
            destination: '', activeRoute: null,
        },
    },
    // ── Scene 3: Navigation active – highway ─────────────────────────────────
    {
        t: 12,
        label: 'Navigation – highway',
        data: {
            speed: 122, power: 28, gear: 'D',
            batteryLevel: 85, range: 395,
            outsideTemp: 5, heading: 87,
            destination: '',
            activeRoute: {
                destination: 'Amsterdam Centraal',
                energy_at_arrival: 62,
                miles_to_arrival: 24.85,
                minutes_to_arrival: 28.5,
                traffic_minutes_delay: 7,
                location: { latitude: 52.3791, longitude: 4.8997 },
                error: null,
            },
        },
    },
    {
        t: 17,
        label: 'Navigation – cruising',
        data: {
            speed: 130, power: 22, gear: 'D',
            batteryLevel: 80, range: 370,
            outsideTemp: 5, heading: 91,
            activeRoute: {
                destination: 'Amsterdam Centraal',
                energy_at_arrival: 62,
                miles_to_arrival: 12.4,
                minutes_to_arrival: 14.2,
                traffic_minutes_delay: 7,
                location: { latitude: 52.3791, longitude: 4.8997 },
                error: null,
            },
        },
    },
    // ── Scene 4: Regen braking ───────────────────────────────────────────────
    {
        t: 22,
        label: 'Regen braking',
        data: {
            speed: 30, power: -38, gear: 'D',
            batteryLevel: 79, range: 366,
            outsideTemp: 5, heading: 105,
            activeRoute: {
                destination: 'Amsterdam Centraal',
                energy_at_arrival: 63,
                miles_to_arrival: 3.1,
                minutes_to_arrival: 5.5,
                traffic_minutes_delay: 0,
                location: { latitude: 52.3791, longitude: 4.8997 },
                error: null,
            },
        },
    },
    // ── Scene 5: Low battery alert ───────────────────────────────────────────
    {
        t: 26,
        label: 'Low battery',
        data: {
            speed: 0, power: 0, gear: 'P',
            batteryLevel: 18, range: 62,
            outsideTemp: 7, heading: 0,
            destination: '', activeRoute: null,
        },
    },
    // ── Scene 6: Reverse + park ──────────────────────────────────────────────
    {
        t: 28,
        label: 'Reversing',
        data: {
            speed: 8, power: 12, gear: 'R',
            batteryLevel: 18, range: 62,
            outsideTemp: 7, heading: 270,
            destination: '', activeRoute: null,
        },
    },
    {
        t: 30,
        label: 'Parked',
        data: {
            speed: 0, power: 0, gear: 'P',
            batteryLevel: 18, range: 62,
            outsideTemp: 7, heading: 0,
            destination: '', activeRoute: null,
        },
    },
];

export const DEMO_DURATION = 30; // seconds

// ── Interpolation helpers ──────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function interpolateField(a: any, b: any, t: number): any {
    if (typeof a === 'number' && typeof b === 'number') return Math.round(lerp(a, b, t));
    // For non-numeric fields, snap at the halfway point
    return t < 0.5 ? a : b;
}

/**
 * Returns the interpolated TeslaData at `elapsedSeconds` by finding the
 * surrounding keyframes and lerping the numeric fields between them.
 */
export function getDemoState(elapsedSeconds: number): Partial<TeslaData> {
    const kf = DEMO_KEYFRAMES;

    // Clamp
    if (elapsedSeconds <= kf[0].t) return kf[0].data;
    if (elapsedSeconds >= kf[kf.length - 1].t) return kf[kf.length - 1].data;

    // Find surrounding keyframes
    let prev = kf[0];
    let next = kf[1];
    for (let i = 1; i < kf.length; i++) {
        if (kf[i].t >= elapsedSeconds) {
            prev = kf[i - 1];
            next = kf[i];
            break;
        }
    }

    const span = next.t - prev.t;
    const t = span === 0 ? 1 : (elapsedSeconds - prev.t) / span;

    // Merge: collect all keys from both frames
    const allKeys = new Set([...Object.keys(prev.data), ...Object.keys(next.data)]) as Set<keyof TeslaData>;

    const result: Partial<TeslaData> = {};
    allKeys.forEach(key => {
        const a = (prev.data as any)[key];
        const b = (next.data as any)[key];
        if (a === undefined) { (result as any)[key] = b; return; }
        if (b === undefined) { (result as any)[key] = a; return; }
        (result as any)[key] = interpolateField(a, b, t);
    });

    return result;
}

/** Returns the current scene label for display during demo */
export function getDemoLabel(elapsedSeconds: number): string {
    let label = DEMO_KEYFRAMES[0].label;
    for (const kf of DEMO_KEYFRAMES) {
        if (elapsedSeconds >= kf.t) label = kf.label;
        else break;
    }
    return label;
}
