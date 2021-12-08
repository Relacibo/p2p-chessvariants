export interface PlaygroundState {
    variant: Variant
}

export type Variant = {
    source: "online",
    address: string,
}