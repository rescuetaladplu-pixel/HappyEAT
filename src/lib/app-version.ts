/**
 * App version configuration.
 *
 * IMPORTANT: เพิ่มเลขนี้ทุกครั้งที่ build APK ใหม่
 * และอัปเดต `latest_version` ในตาราง `app_config` ให้ตรงกัน
 */
export const APP_VERSION = '1.0.0';

/**
 * เปรียบเทียบ semver แบบง่าย (major.minor.patch)
 * คืนค่า: -1 ถ้า a < b, 0 ถ้าเท่ากัน, 1 ถ้า a > b
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}
