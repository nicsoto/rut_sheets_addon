#!/usr/bin/env fish

set script_dir (cd (dirname (status -f)); pwd)
set project_dir (cd "$script_dir/.."; pwd)

if not test -f "$project_dir/.env"
  cp "$project_dir/.env.example" "$project_dir/.env"
  echo "Created .env from .env.example"
else
  echo ".env already exists, leaving it unchanged"
end

set token (python3 -c "import secrets; print(secrets.token_urlsafe(32))")

echo "\nGenerated admin token (store in Apps Script Script Properties as rutCleaner.v1.adminApiToken):"
echo $token

echo "\nSet APPS_SCRIPT_ADMIN_TOKEN in licensing_webhook_service/.env to this same token."
