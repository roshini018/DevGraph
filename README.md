# DevGraph
AI-powered codebase intelligence using knowledge graphs, hybrid retrieval, and evidence-grounded code analysis.

## Backend Setup

### Prerequisites
- Python 3.13+

### Installation & Local Run

1. Navigate to the backend directory:
   ```bash
   cd Backend
   ```

2. Create and activate a virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. Install dependencies (use `requirements-dev.txt` for development & testing):
   ```bash
   pip install -r requirements-dev.txt
   ```

4. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your Neo4j and Qdrant credentials
   ```

5. Run automated tests:
   ```bash
   pytest
   ```

6. Start the development server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

### TLS Certificate Handling Note
The backend includes an automatic, secure TLS configuration (`configure_tls()`). On macOS, standalone Python frameworks do not use the system Keychain CAs by default; the backend verifies whether `SSL_CERT_FILE` points to an existing file and, if unset or invalid, automatically configures Mozilla's trusted root CA bundle via `certifi`. TLS verification remains 100% strictly enabled with zero security compromises.
