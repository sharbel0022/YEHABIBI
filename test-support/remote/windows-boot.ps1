$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class YehabibiBootIdentity {
  [DllImport("ntdll.dll")]
  private static extern int NtQuerySystemInformation(int kind, IntPtr data, int length, out int returned);
  public static string Read() {
    IntPtr data=Marshal.AllocHGlobal(32);
    try {
      int returned;
      // SYSTEM_BOOT_ENVIRONMENT_INFORMATION starts with the boot GUID.
      // Unlike WMI LastBootUpTime, this identifier cannot drift with clock correction.
      if(NtQuerySystemInformation(90,data,32,out returned)!=0) throw new InvalidOperationException("Boot identity unavailable");
      byte[] bytes=new byte[16];Marshal.Copy(data,bytes,0,16);
      Guid value=new Guid(bytes);
      if(value==Guid.Empty) throw new InvalidOperationException("Empty boot identity");
      return value.ToString("D");
    } finally { Marshal.FreeHGlobal(data); }
  }
}
'@
[YehabibiBootIdentity]::Read()
