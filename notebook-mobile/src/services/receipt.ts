import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
export async function pickReceipt(camera: boolean): Promise<string | null> {
  if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error('Camera access was declined. You can attach a receipt from your photos instead.');
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, allowsEditing: false };
  const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const asset = result.assets[0];
  const context = ImageManipulator.manipulate(asset.uri);
  const longest = Math.max(asset.width, asset.height);
  if (longest > 1600) context.resize(asset.width >= asset.height ? { width: 1600 } : { height: 1600 });
  const image = await context.renderAsync();
  try {
    for (const compress of [0.8, 0.6, 0.4]) {
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
      if (saved.base64 && saved.base64.length < 799970) return 'data:image/jpeg;base64,' + saved.base64;
    }
    throw new Error('This photo is too large. Try photographing just the receipt.');
  } finally { image.release(); context.release(); }
}
