# Plutus Scan

## Development Notes

### How to Setup local Postgres for dev

Init local dev psql db

`createuser --superuser postgres`

`psql -U postgres`

Then create db:

```
CREATE USER cardano PASSWORD 'password';

CREATE DATABASE plutus_scan WITH OWNER cardano;
```
