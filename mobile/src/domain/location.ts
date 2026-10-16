export type Coordinate = { latitude: number; longitude: number };
export async function locateDelivery(provider: { permission: () => Promise<string>; position: () => Promise<Coordinate> }, timeout = 15000): Promise<{ coordinates?: Coordinate; message?: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (await provider.permission() !== 'granted') return { message: 'Location permission denied. You can still select a pin or enter your address manually.' };
    const coordinates = await Promise.race([provider.position(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Location timeout')), timeout); })]);
    if (!Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude) || Math.abs(coordinates.latitude) > 90 || Math.abs(coordinates.longitude) > 180) throw new Error('Invalid position');
    return { coordinates };
  } catch { return { message: 'Location unavailable. Select a pin or enter your address manually.' }; }
  finally { clearTimeout(timer); }
}
