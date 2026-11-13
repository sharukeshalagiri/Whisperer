# E2E insertion target for Windows: a plain WinForms text box that brings itself to the foreground and
# mirrors its text to a file. Usage: target-win.ps1 <textFile> <hwndFile> [initialText]
param([string]$TextFile, [string]$HwndFile, [string]$InitialText = '')
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class E2eFg {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
'@
$form = New-Object System.Windows.Forms.Form
$form.Text = 'E2E target'; $form.Width = 640; $form.Height = 240; $form.TopMost = $true; $form.StartPosition = 'CenterScreen'
$box = New-Object System.Windows.Forms.TextBox
$box.Multiline = $true; $box.Dock = 'Fill'; $box.Text = $InitialText; $box.HideSelection = $false
$form.Controls.Add($box)
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 20
$timer.Add_Tick({
  [System.IO.File]::WriteAllText($TextFile, $box.Text)
  # Report whether this window still holds the foreground, so the driver can tell a focus problem from a product one.
  [System.IO.File]::WriteAllText($HwndFile, "$($form.Handle.ToInt64()) $PID $([E2eFg]::GetForegroundWindow().ToInt64())")
})
$form.Add_Shown({
  # An ALT tap lifts the foreground lock for a process that was not started by the foreground app.
  [E2eFg]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [E2eFg]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
  [void][E2eFg]::SetForegroundWindow($form.Handle)
  $form.Activate(); $box.Focus(); $box.SelectAll()
  $timer.Start()
})
[System.Windows.Forms.Application]::Run($form)
