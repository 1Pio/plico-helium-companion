#!/bin/bash
# Explicit user approval is required before install. No network or paid account.
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
folder="$PWD/.local/signing"
name='Plico Companion Local Development'
case "${1:-}" in
prepare)
 mkdir -p "$folder"
 if [[ -s "$folder/identity.p12" ]]; then echo 'Existing prepared identity preserved'; exit 0; fi
 cat > "$folder/openssl.cnf" <<'EOF'
[req]
distinguished_name=dn
x509_extensions=ext
prompt=no
[dn]
CN=Plico Companion Local Development
[ext]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=critical,codeSigning
subjectKeyIdentifier=hash
EOF
 openssl rand -hex 24 > "$folder/password"
 openssl req -new -newkey rsa:2048 -x509 -days 730 -config "$folder/openssl.cnf" -passout "file:$folder/password" -keyout "$folder/private.pem" -out "$folder/certificate.pem" 2> "$folder/prepare.log"
 PLICO_KEY_PASSWORD="$(cat "$folder/password")" openssl pkcs12 -export -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 -inkey "$folder/private.pem" -in "$folder/certificate.pem" -name "$name" -passin env:PLICO_KEY_PASSWORD -passout env:PLICO_KEY_PASSWORD -out "$folder/identity.p12"
 openssl x509 -in "$folder/certificate.pem" -noout -subject -fingerprint -sha256
 ;;
install)
 [[ -f "$folder/identity.p12" ]] || { echo 'Run prepare first'; exit 2; }
 keychain="$HOME/Library/Keychains/login.keychain-db"
 security import "$folder/identity.p12" -k "$keychain" -P "$(cat "$folder/password")" -T /usr/bin/codesign
 # User trust is restricted to code signing, not TLS or other certificate policies.
 security add-trusted-cert -r trustRoot -p codeSign -k "$keychain" "$folder/certificate.pem"
 security find-identity -v -p codesigning "$keychain"
 ;;
*) echo 'Usage: local-signing.sh prepare|install'; exit 2;;
esac
