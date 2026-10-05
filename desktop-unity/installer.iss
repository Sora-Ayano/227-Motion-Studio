#ifndef PayloadDir
  #error PayloadDir must point to a privacy-audited desktop package
#endif
#ifndef OutputDir
  #define OutputDir "output"
#endif
#ifndef AppVersion
  #define AppVersion "0.4.0-preview.1"
#endif
[Setup]
AppId={{71DF183C-85AC-4B1B-A876-C0F32B227004}
AppName=22/7 Motion Studio
AppVersion={#AppVersion}
AppPublisher=Sora-Ayano
AppPublisherURL=https://github.com/Sora-Ayano/227-Motion-Studio
AppSupportURL=https://github.com/Sora-Ayano/227-Motion-Studio/issues
AppUpdatesURL=https://github.com/Sora-Ayano/227-Motion-Studio/releases
DefaultDirName={localappdata}\Programs\22-7 Motion Studio
DefaultGroupName=22-7 Motion Studio
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename=22-7-Motion-Studio-v{#AppVersion}-Windows-x64-Setup
SetupIconFile={#PayloadDir}\studio\native-app.ico
UninstallDisplayIcon={app}\studio\native-app.ico
Compression=lzma2/fast
SolidCompression=no
DiskSpanning=yes
DiskSliceSize=1073741824
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
LicenseFile={#PayloadDir}\studio\LICENSE
DisableProgramGroupPage=yes
[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: unchecked
[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "files.sha256"
[Icons]
Name: "{group}\22-7 Motion Studio"; Filename: "{app}\22-7 Motion Studio.exe"; WorkingDir: "{app}"; IconFilename: "{app}\studio\native-app.ico"
Name: "{autodesktop}\22-7 Motion Studio"; Filename: "{app}\22-7 Motion Studio.exe"; WorkingDir: "{app}"; IconFilename: "{app}\studio\native-app.ico"; Tasks: desktopicon
[Run]
Filename: "{app}\22-7 Motion Studio.exe"; Description: "Launch 22/7 Motion Studio"; Flags: nowait postinstall skipifsilent
