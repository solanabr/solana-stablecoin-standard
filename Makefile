.PHONY: build test clean docker-up docker-down devnet-deploy

build:
	cargo build-sbf
	cd sdk && npm run build
	cd cli && npm run build

test:
	cargo test
	anchor test

up:
	chmod +x scripts/prepare_native.sh
	./scripts/prepare_native.sh
	docker compose up --build -d
	@echo "--- SSS ECOSYSTEM STARTING ---"
	@echo "Solana Validator: http://localhost:8899"
	@echo "Frontend: http://localhost:5173"
	@echo "Orchestrator: http://localhost:8081"
	@echo "Database: localhost:5432"
	@echo "-------------------------------"

down:
	docker compose down -v
