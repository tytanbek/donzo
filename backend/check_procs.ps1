# Show project python processes with parent PID, creation time, memory
Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
    Where-Object { $_.CommandLine -match 'ai bilan' } |
    Select-Object ProcessId, ParentProcessId, CreationDate,
        @{N='MemMB'; E={[math]::Round($_.WorkingSetSize/1MB, 1)}},
        @{N='Kind'; E={ if ($_.CommandLine -match 'daphne') {'DAPHNE'}
                        elseif ($_.CommandLine -match 'bot_supervisor') {'SUPERVISOR'}
                        elseif ($_.CommandLine -match 'bot\.py') {'BOT'}
                        else {'OTHER'} }} |
    Sort-Object Kind, CreationDate |
    Format-Table -AutoSize | Out-String -Width 220
