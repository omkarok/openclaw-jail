Get-WinEvent -FilterHashtable @{LogName='System'; Id=@(41,1074,6006,6008,42,107)} -MaxEvents 5 -ErrorAction SilentlyContinue |
  Select-Object TimeCreated, Id, Message |
  Format-List
