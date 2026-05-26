; Inno Setup script for Storage Inventory
; Requires Inno Setup 6+ (https://jrsoftware.org/isinfo.php)
; Build the PyInstaller exe first, then compile this script.

#define AppName "Storage Inventory"
#define AppVersion "1.0.0"
#define AppPublisher "Quinn Hughes"
#define AppExeName "StorageInventory.exe"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\StorageInventory
DefaultGroupName={#AppName}
OutputDir=installer\output
OutputBaseFilename=StorageInventory_Setup_{#AppVersion}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
; Creates %APPDATA%\StorageInventory on install
; (the Python app creates it itself at runtime, but listing it ensures clean uninstall)

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "dist\StorageInventory.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}";   Filename: "{app}\{#AppExeName}"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{commondesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Remove the config directory on uninstall (optional – comment out to preserve data)
; Type: filesandordirs; Name: "{userappdata}\StorageInventory"
