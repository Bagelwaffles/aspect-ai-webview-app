#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$KeystorePath = 'C:\Users\white\Documents\AMS-Signing\aspect-marketing-solutions-upload-2026b.jks',
    [string]$Alias = 'ams-upload-2026b',
    [string]$CredentialTarget = 'AMS Google Play upload keystore 2026b',
    [string]$UnsignedAabPath,
    [string]$OutputAabPath = 'C:\Users\white\Documents\AMS-Signing\AMS-Android-2.0.0-PLAY-READY.aab'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExpectedCertificateSha1 = '32:48:3E:C2:E4:3F:6B:52:7B:27:21:0D:6B:A1:F0:00:55:35:45:C0'
$ExpectedPackage = 'com.aspectmarketingsolutions.app'
$ExpectedVersionCode = '20000'
$ExpectedVersionName = '2.0.0'
$ExpectedCompileSdk = '36'
$ExpectedTargetSdk = '36'
$SigningPasswordEnvironmentVariable = 'AMS_GOOGLE_PLAY_SIGNING_PASSWORD'

function Resolve-JavaTool {
    param([Parameter(Mandatory)][string]$Name)

    if ($env:JAVA_HOME) {
        $candidate = Join-Path $env:JAVA_HOME "bin\$Name.exe"
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return $candidate
        }
    }

    $command = Get-Command "$Name.exe" -ErrorAction SilentlyContinue
    if (-not $command) {
        $command = Get-Command $Name -ErrorAction SilentlyContinue
    }
    if (-not $command) {
        throw "$Name was not found. Install JDK 17 and ensure JAVA_HOME or PATH points to it."
    }
    return $command.Source
}

function Get-WindowsStoredCredentialSecret {
    param([Parameter(Mandatory)][string]$Target)

    if (-not ('Ams.NativeCredential' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

namespace Ams {
    public static class NativeCredential {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public struct CREDENTIAL {
            public UInt32 Flags;
            public UInt32 Type;
            public IntPtr TargetName;
            public IntPtr Comment;
            public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
            public UInt32 CredentialBlobSize;
            public IntPtr CredentialBlob;
            public UInt32 Persist;
            public UInt32 AttributeCount;
            public IntPtr Attributes;
            public IntPtr TargetAlias;
            public IntPtr UserName;
        }

        [DllImport("Advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool CredRead(string target, uint type, int reservedFlag, out IntPtr credentialPtr);

        [DllImport("Advapi32.dll", EntryPoint = "CredFree", SetLastError = true)]
        private static extern void CredFree(IntPtr credentialPtr);

        public static string ReadSecret(string target) {
            IntPtr pointer;
            for (uint type = 1; type <= 2; type++) {
                if (!CredRead(target, type, 0, out pointer)) {
                    continue;
                }
                try {
                    CREDENTIAL credential = (CREDENTIAL)Marshal.PtrToStructure(pointer, typeof(CREDENTIAL));
                    if (credential.CredentialBlob == IntPtr.Zero || credential.CredentialBlobSize == 0) {
                        throw new InvalidOperationException("The credential exists but has no stored secret.");
                    }
                    return Marshal.PtrToStringUni(
                        credential.CredentialBlob,
                        checked((int)credential.CredentialBlobSize / 2)
                    );
                }
                finally {
                    CredFree(pointer);
                }
            }
            throw new Win32Exception(Marshal.GetLastWin32Error(),
                "Windows Credential Manager entry was not found: " + target);
        }
    }
}
'@
    }

    return [Ams.NativeCredential]::ReadSecret($Target)
}

function Invoke-JavaTool {
    param(
        [Parameter(Mandatory)][string]$Executable,
        [Parameter(Mandatory)][string[]]$Arguments,
        [switch]$Capture
    )

    if ($Capture) {
        $output = & $Executable @Arguments 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "$([IO.Path]::GetFileName($Executable)) failed with exit code $LASTEXITCODE."
        }
        return ($output -join [Environment]::NewLine)
    }

    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$([IO.Path]::GetFileName($Executable)) failed with exit code $LASTEXITCODE."
    }
}

function Normalize-Sha1 {
    param([Parameter(Mandatory)][string]$Value)
    return (($Value -replace '[^0-9A-Fa-f]', '').ToUpperInvariant() -split '(.{2})' |
        Where-Object { $_ }) -join ':'
}

function Get-CertificateSha1FromText {
    param([Parameter(Mandatory)][string]$Text)
    $match = [regex]::Match($Text, '(?im)^\s*SHA1:\s*([0-9A-F:]+)\s*$')
    if (-not $match.Success) {
        throw 'Unable to locate a SHA-1 certificate fingerprint in Java tool output.'
    }
    return Normalize-Sha1 $match.Groups[1].Value
}

function Find-ByteSequence {
    param(
        [Parameter(Mandatory)][byte[]]$Bytes,
        [Parameter(Mandatory)][byte[]]$Needle,
        [int]$Start = 0,
        [int]$Window = 0
    )

    if ($Needle.Length -eq 0 -or $Bytes.Length -lt $Needle.Length) { return -1 }
    $last = $Bytes.Length - $Needle.Length
    if ($Window -gt 0) {
        $last = [Math]::Min($last, $Start + $Window)
    }
    for ($index = [Math]::Max(0, $Start); $index -le $last; $index++) {
        $found = $true
        for ($offset = 0; $offset -lt $Needle.Length; $offset++) {
            if ($Bytes[$index + $offset] -ne $Needle[$offset]) {
                $found = $false
                break
            }
        }
        if ($found) { return $index }
    }
    return -1
}

function Assert-ManifestPair {
    param(
        [Parameter(Mandatory)][byte[]]$ManifestBytes,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Value
    )

    $ascii = [Text.Encoding]::ASCII
    $nameIndex = Find-ByteSequence $ManifestBytes ($ascii.GetBytes($Name))
    if ($nameIndex -lt 0) {
        throw "AAB manifest does not contain required attribute: $Name"
    }
    $valueIndex = Find-ByteSequence $ManifestBytes ($ascii.GetBytes($Value)) $nameIndex 160
    if ($valueIndex -lt 0) {
        throw "AAB manifest identity mismatch: expected $Name=$Value"
    }
}

function Get-AabManifestBytes {
    param([Parameter(Mandatory)][string]$AabPath)

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($AabPath)
    try {
        $entry = $archive.GetEntry('base/manifest/AndroidManifest.xml')
        if (-not $entry) { throw 'AAB is missing base/manifest/AndroidManifest.xml.' }
        $stream = $entry.Open()
        try {
            $memory = New-Object IO.MemoryStream
            $stream.CopyTo($memory)
            return $memory.ToArray()
        }
        finally {
            $stream.Dispose()
        }
    }
    finally {
        $archive.Dispose()
    }
}

function Export-EmbeddedMapping {
    param(
        [Parameter(Mandatory)][string]$AabPath,
        [Parameter(Mandatory)][string]$Destination
    )

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($AabPath)
    try {
        $entry = $archive.GetEntry('BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map')
        if (-not $entry) { throw 'AAB is missing its embedded R8 ProGuard mapping.' }
        $source = $entry.Open()
        try {
            $destinationStream = [IO.File]::Open($Destination, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
            try { $source.CopyTo($destinationStream) }
            finally { $destinationStream.Dispose() }
        }
        finally { $source.Dispose() }
    }
    finally { $archive.Dispose() }
}

$outputDirectory = Split-Path -Parent $OutputAabPath
$mappingPath = Join-Path $outputDirectory 'AMS-Android-2.0.0-mapping.txt'
$reportPath = Join-Path $outputDirectory 'AMS-Android-2.0.0-PLAY-READY-verification.txt'
$workingAabPath = Join-Path $outputDirectory ('.AMS-Android-2.0.0-signing-' + [Guid]::NewGuid().ToString('N') + '.aab')
$password = $null

try {
    if (-not (Test-Path -LiteralPath $KeystorePath -PathType Leaf)) {
        throw "Upload keystore not found: $KeystorePath"
    }

    if (-not $UnsignedAabPath) {
        $inputCandidates = @(
            (Join-Path $outputDirectory 'AMS-Android-2.0.0-target36-UNSIGNED.aab'),
            'C:\Users\white\Downloads\AMS-Android-2.0.0-target36-UNSIGNED.aab'
        )
        $UnsignedAabPath = $inputCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    }
    if (-not $UnsignedAabPath -or -not (Test-Path -LiteralPath $UnsignedAabPath -PathType Leaf)) {
        throw 'Unsigned AAB not found. Save AMS-Android-2.0.0-target36-UNSIGNED.aab in AMS-Signing or Downloads, or pass -UnsignedAabPath.'
    }

    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    $keytool = Resolve-JavaTool 'keytool'
    $jarsigner = Resolve-JavaTool 'jarsigner'

    $manifestBytes = Get-AabManifestBytes $UnsignedAabPath
    Assert-ManifestPair $manifestBytes 'package' $ExpectedPackage
    Assert-ManifestPair $manifestBytes 'versionCode' $ExpectedVersionCode
    Assert-ManifestPair $manifestBytes 'versionName' $ExpectedVersionName
    Assert-ManifestPair $manifestBytes 'compileSdkVersion' $ExpectedCompileSdk
    Assert-ManifestPair $manifestBytes 'targetSdkVersion' $ExpectedTargetSdk

    $password = Get-WindowsStoredCredentialSecret $CredentialTarget
    if ([string]::IsNullOrEmpty($password)) {
        throw 'The Windows Credential Manager entry returned an empty secret.'
    }
    [Environment]::SetEnvironmentVariable($SigningPasswordEnvironmentVariable, $password, 'Process')

    $keystoreDetails = Invoke-JavaTool -Executable $keytool -Capture -Arguments @(
        '-list', '-v',
        '-keystore', $KeystorePath,
        '-alias', $Alias,
        '-storepass:env', $SigningPasswordEnvironmentVariable
    )
    $keystoreSha1 = Get-CertificateSha1FromText $keystoreDetails
    if ($keystoreSha1 -ne $ExpectedCertificateSha1) {
        throw "Upload certificate rejected. Expected $ExpectedCertificateSha1 but found $keystoreSha1. Nothing was signed."
    }

    Copy-Item -LiteralPath $UnsignedAabPath -Destination $workingAabPath -Force
    Invoke-JavaTool -Executable $jarsigner -Arguments @(
        '-keystore', $KeystorePath,
        '-storepass:env', $SigningPasswordEnvironmentVariable,
        '-keypass:env', $SigningPasswordEnvironmentVariable,
        $workingAabPath,
        $Alias
    )

    $verificationOutput = Invoke-JavaTool -Executable $jarsigner -Capture -Arguments @(
        '-verify', '-verbose', '-certs', $workingAabPath
    )
    if ($verificationOutput -notmatch '(?im)^jar verified\.$') {
        throw 'jarsigner did not report a cryptographically verified bundle.'
    }

    $signedCertificate = Invoke-JavaTool -Executable $keytool -Capture -Arguments @(
        '-printcert', '-jarfile', $workingAabPath
    )
    $signedSha1 = Get-CertificateSha1FromText $signedCertificate
    if ($signedSha1 -ne $ExpectedCertificateSha1) {
        throw "Signed AAB certificate mismatch: $signedSha1"
    }

    $signedManifestBytes = Get-AabManifestBytes $workingAabPath
    Assert-ManifestPair $signedManifestBytes 'package' $ExpectedPackage
    Assert-ManifestPair $signedManifestBytes 'versionCode' $ExpectedVersionCode
    Assert-ManifestPair $signedManifestBytes 'versionName' $ExpectedVersionName
    Assert-ManifestPair $signedManifestBytes 'compileSdkVersion' $ExpectedCompileSdk
    Assert-ManifestPair $signedManifestBytes 'targetSdkVersion' $ExpectedTargetSdk

    if (Test-Path -LiteralPath $OutputAabPath -PathType Leaf) {
        $backupPath = "$OutputAabPath.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Move-Item -LiteralPath $OutputAabPath -Destination $backupPath
    }
    Move-Item -LiteralPath $workingAabPath -Destination $OutputAabPath
    Export-EmbeddedMapping -AabPath $OutputAabPath -Destination $mappingPath

    $sha256 = (Get-FileHash -LiteralPath $OutputAabPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $mappingSha256 = (Get-FileHash -LiteralPath $mappingPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $report = @(
        'AMS Android 2.0.0 Play-ready verification',
        "AAB path: $OutputAabPath",
        "AAB SHA-256: $sha256",
        "Signing certificate SHA-1: $signedSha1",
        "Package: $ExpectedPackage",
        "Version code: $ExpectedVersionCode",
        "Version name: $ExpectedVersionName",
        "Compile SDK: $ExpectedCompileSdk",
        "Target SDK: $ExpectedTargetSdk",
        "R8 mapping path: $mappingPath",
        "R8 mapping SHA-256: $mappingSha256",
        'Cryptographic verification: PASSED',
        "Verified at: $((Get-Date).ToString('o'))",
        'Google Play upload: NOT PERFORMED'
    )
    [IO.File]::WriteAllLines($reportPath, $report, (New-Object Text.UTF8Encoding($false)))
    $report | ForEach-Object { Write-Host $_ }
}
finally {
    [Environment]::SetEnvironmentVariable($SigningPasswordEnvironmentVariable, $null, 'Process')
    $password = $null
    if (Test-Path -LiteralPath $workingAabPath -PathType Leaf) {
        Remove-Item -LiteralPath $workingAabPath -Force
    }
}
