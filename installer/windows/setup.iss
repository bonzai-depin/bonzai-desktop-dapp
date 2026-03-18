#define MyAppName "BonzAI"
#define MyAppPublisher "BonzAI Foundation"
#define MyAppURL "https://bonzai.sh"
#define MyAppExeName "BonzAI.exe"

; Paths passed as absolute defines from CI via /D flags.
; Defaults use relative paths for local builds from installer/windows/.
#ifndef MySourceDir
  #define MySourceDir "..\..\out\BonzAI-win32-x64"
#endif
#ifndef MyOutputDir
  #define MyOutputDir "..\..\out\make"
#endif
#ifndef MyIconFile
  #define MyIconFile "..\..\src\assets\logo.ico"
#endif

[Setup]
AppId={{B0NZAI-D3SK-T0P-APP1-CAT10N000001}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir={#MyOutputDir}
Compression=lzma2
SolidCompression=yes
SetupIconFile={#MyIconFile}
UninstallDisplayIcon={app}\{#MyAppExeName}
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#MySourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
