#ifndef SourceExe
  #error SourceExe is required
#endif
#ifndef Version
  #define Version "0.0.0"
#endif
#ifndef OutputDir
  #define OutputDir "."
#endif
#ifndef OutputName
  #define OutputName "venus-node-windows-x64-setup"
#endif

[Setup]
AppId={{2A821424-82D4-4C07-B5B5-8366396345A1}
AppName=Venus Node
AppVersion={#Version}
AppPublisher=Little Yellow Whale
AppPublisherURL=https://github.com/alanmao1984/littleyellowwhale
DefaultDirName={localappdata}\Programs\Venus Node
DefaultGroupName=Venus Node
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename={#OutputName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=Venus Node
VersionInfoProductName=Venus Node
VersionInfoDescription=Venus 交互式前台节点安装程序

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加快捷方式："; Flags: unchecked

[Files]
Source: "{#SourceExe}"; DestDir: "{app}"; DestName: "venus-node.exe"; Flags: ignoreversion

[Icons]
Name: "{group}\启动 Venus Node"; Filename: "{app}\venus-node.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\启动 Venus Node"; Filename: "{app}\venus-node.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\venus-node.exe"; Description: "启动交互式节点（不会安装后台服务）"; Flags: postinstall nowait skipifsilent unchecked
