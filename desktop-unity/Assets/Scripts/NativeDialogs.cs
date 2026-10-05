using System;using System.Runtime.InteropServices;
namespace MotionStudio {
 public static class NativeDialogs {
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] class FileDialog {public int size=Marshal.SizeOf(typeof(FileDialog));public IntPtr owner,instance;public string filter;public IntPtr customFilter;public int maxCustomFilter,filterIndex=1;public string file=new string('\0',32768);public int maxFile=32768;public string fileTitle;public int maxFileTitle;public string initialDir,title;public int flags;public short fileOffset,extensionOffset;public string defaultExtension;public IntPtr data,hook;public string template;public IntPtr reserved;public int reserved1,flagsEx;}
  [DllImport("comdlg32.dll",CharSet=CharSet.Unicode)] static extern bool GetSaveFileNameW([In,Out]FileDialog data);
  [DllImport("comdlg32.dll",CharSet=CharSet.Unicode)] static extern bool GetOpenFileNameW([In,Out]FileDialog data);
  public static string Save(string extension,string title){var d=new FileDialog{filter=extension.ToUpper()+"\0*."+extension+"\0\0",title=title,defaultExtension=extension,flags=0x00080000|0x00000002|0x00000008};return GetSaveFileNameW(d)?d.file.Split('\0')[0]:null;}
  public static string Open(string extension,string title){var d=new FileDialog{filter=extension.ToUpper()+"\0*."+extension+"\0\0",title=title,flags=0x00080000|0x00001000|0x00000008};return GetOpenFileNameW(d)?d.file.Split('\0')[0]:null;}
  public static string OpenImage(){var d=new FileDialog{filter="背景图片\0*.png;*.jpg;*.jpeg\0\0",title="导入背景图片 / 替换舞台",flags=0x00080000|0x00001000|0x00000008};return GetOpenFileNameW(d)?d.file.Split('\0')[0]:null;}
 }
}
