/**
 * DevGraph acme/my-store Mock Repository
 * 16 analyzed Python files + README.md & requirements.txt
 * Derived symbols & edges with accurate line numbers
 */

import type {
  ConnectedRepo,
  GithubRepo,
  FileContent,
  GraphNode,
  GraphEdge,
  GraphData,
  RepoStats,
  TreeNode,
  NodeDetail,
  ConnectionResult,
  ImpactResult,
  ImpactedNode,
  SearchResult,
  SearchMatch,
  AskResult,
  Citation,
} from '../types/api';

export const MOCK_GITHUB_REPOS: GithubRepo[] = [
  {
    id: 'gh-1',
    name: 'my-store',
    full_name: 'acme/my-store',
    private: false,
    html_url: 'https://github.com/acme/my-store',
    description: 'E-commerce microservice architecture with FastAPI and payment settlement',
    default_branch: 'main',
    language: 'Python',
    stars: 142,
    updated_at: '2026-10-22T08:00:00Z',
  },
  {
    id: 'gh-2',
    name: 'auth-gateway',
    full_name: 'acme/auth-gateway',
    private: true,
    html_url: 'https://github.com/acme/auth-gateway',
    description: 'OAuth2 and JWT token broker service',
    default_branch: 'main',
    language: 'Go',
    stars: 38,
    updated_at: '2026-10-21T14:30:00Z',
  },
];

export const MOCK_FILES: FileContent[] = [
  {
    "path": "src/utils/validators.py",
    "content": "\"\"\"Validation utilities for user input and payment amounts.\"\"\"\nimport re\nfrom typing import Optional\n\nEMAIL_REGEX = re.compile(r\"^[\\w\\.-]+@[\\w\\.-]+\\.\\w+$\")\nUUID_REGEX = re.compile(r\"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\")\nALLOWED_CURRENCIES = {\"USD\", \"EUR\", \"GBP\", \"CAD\"}\n\n\ndef validate_email(email: str) -> bool:\n    \"\"\"Validate that an email string conforms to standard email format.\"\"\"\n    if not email or not isinstance(email, str):\n        return False\n    return bool(EMAIL_REGEX.match(email.strip()))\n\n\ndef validate_amount(amount: float) -> bool:\n    \"\"\"Validate that a monetary transaction amount is positive and non-zero.\"\"\"\n    if amount is None or not isinstance(amount, (int, float)):\n        return False\n    return amount > 0.0\n\n\ndef validate_uuid(identifier: str) -> bool:\n    \"\"\"Validate string representation of standard UUID v4 format.\"\"\"\n    if not identifier or not isinstance(identifier, str):\n        return False\n    return bool(UUID_REGEX.match(identifier.lower()))\n\n\ndef validate_currency(currency: str) -> bool:\n    \"\"\"Ensure the specified currency code is supported in our system.\"\"\"\n    if not currency:\n        return False\n    return currency.upper() in ALLOWED_CURRENCIES\n\n\ndef sanitize_input(text: str) -> str:\n    \"\"\"Strip dangerous characters and excess whitespace from user string.\"\"\"\n    if not text:\n        return \"\"\n    return re.sub(r\"[<>;&]\", \"\", text).strip()\n",
    "language": "python",
    "lines": 42,
    "analyzed": true,
    "symbols": [
      "validate_email",
      "validate_amount",
      "validate_uuid",
      "validate_currency",
      "sanitize_input"
    ]
  },
  {
    "path": "src/utils/logger.py",
    "content": "\"\"\"System logging and diagnostic utilities.\"\"\"\nimport logging\nimport os\nfrom typing import Dict, Any\n\n_LOGGER_INSTANCE = None\n\n\ndef configure_logger(name: str = \"devgraph\") -> logging.Logger:\n    \"\"\"Initialize and configure global logger instance with formatting.\"\"\"\n    global _LOGGER_INSTANCE\n    level = os.getenv(\"LOG_LEVEL\", \"INFO\")\n    logger = logging.getLogger(name)\n    logger.setLevel(level)\n    _LOGGER_INSTANCE = logger\n    return logger\n\n\ndef get_logger() -> logging.Logger:\n    \"\"\"Retrieve the singleton logger instance or create default.\"\"\"\n    global _LOGGER_INSTANCE\n    if _LOGGER_INSTANCE is None:\n        return configure_logger()\n    return _LOGGER_INSTANCE\n\n\ndef mask_sensitive_data(payload: Dict[str, Any]) -> Dict[str, Any]:\n    \"\"\"Sanitize payment and authentication credentials in log dictionaries.\"\"\"\n    sanitized = payload.copy()\n    for key in (\"password\", \"token\", \"cvv\", \"card_number\"):\n        if key in sanitized:\n            sanitized[key] = \"***REDACTED***\"\n    return sanitized\n",
    "language": "python",
    "lines": 33,
    "analyzed": true,
    "symbols": [
      "configure_logger",
      "get_logger",
      "mask_sensitive_data"
    ]
  },
  {
    "path": "src/utils/isolated_calc.py",
    "content": "\"\"\"Pure mathematical checksum utilities for data integrity.\"\"\"\nimport hashlib\nfrom typing import Union\n\n\ndef calculate_checksum(data: Union[str, bytes]) -> str:\n    \"\"\"Calculate MD5 checksum for binary or string payload.\"\"\"\n    if isinstance(data, str):\n        data = data.encode(\"utf-8\")\n    hasher = hashlib.md5()\n    hasher.update(data)\n    return hasher.hexdigest()\n\n\ndef compute_sha256_digest(content: bytes) -> str:\n    \"\"\"Compute standard SHA-256 digest string for verification.\"\"\"\n    hasher = hashlib.sha256()\n    hasher.update(content)\n    return hasher.hexdigest()\n\n\ndef verify_payload_integrity(raw_data: bytes, expected_hash: str) -> bool:\n    \"\"\"Verify raw byte sequence matches anticipated SHA-256 fingerprint.\"\"\"\n    calculated = compute_sha256_digest(raw_data)\n    return calculated.lower() == expected_hash.lower()\n",
    "language": "python",
    "lines": 25,
    "analyzed": true,
    "symbols": [
      "calculate_checksum",
      "compute_sha256_digest",
      "verify_payload_integrity"
    ]
  },
  {
    "path": "src/models/base.py",
    "content": "\"\"\"Base persistent model providing serialization primitives.\"\"\"\nfrom datetime import datetime\nfrom typing import Dict, Any\n\n\nclass BaseModel:\n    \"\"\"Abstract entity with unique identifier and audit timestamps.\"\"\"\n\n    def __init__(self, id: str):\n        self.id = id\n        self.created_at = datetime.utcnow()\n        self.updated_at = self.created_at\n\n    def to_dict(self) -> Dict[str, Any]:\n        \"\"\"Serialize entity attributes to standard Python dictionary.\"\"\"\n        return {\n            \"id\": self.id,\n            \"created_at\": self.created_at.isoformat(),\n            \"updated_at\": self.updated_at.isoformat(),\n        }\n\n    @classmethod\n    def from_dict(cls, data: Dict[str, Any]):\n        \"\"\"Deserialize raw dictionary into entity instance.\"\"\"\n        return cls(id=data[\"id\"])\n",
    "language": "python",
    "lines": 25,
    "analyzed": true,
    "symbols": [
      "BaseModel",
      "BaseModel.to_dict",
      "BaseModel.from_dict"
    ]
  },
  {
    "path": "src/models/user.py",
    "content": "\"\"\"User domain model and status checks.\"\"\"\nfrom typing import Dict, Any\nfrom src.models.base import BaseModel\nfrom src.utils.validators import validate_email\n\n\nclass User(BaseModel):\n    \"\"\"Registered application user account.\"\"\"\n\n    def __init__(self, id: str, email: str, role: str = \"member\"):\n        super().__init__(id)\n        validate_email(email)\n        self.email = email\n        self.role = role\n        self.active = True\n\n    def is_active(self) -> bool:\n        \"\"\"Check whether the user account is active and permitted access.\"\"\"\n        return self.active\n\n    def get_display_name(self) -> str:\n        \"\"\"Return username portion of email for interface presentation.\"\"\"\n        return self.email.split(\"@\")[0]\n\n    def to_dict(self) -> Dict[str, Any]:\n        \"\"\"Serialize user account data including email and role.\"\"\"\n        data = super().to_dict()\n        data.update({\"email\": self.email, \"role\": self.role, \"active\": self.active})\n        return data\n",
    "language": "python",
    "lines": 29,
    "analyzed": true,
    "symbols": [
      "User",
      "User.is_active",
      "User.get_display_name",
      "User.to_dict"
    ]
  },
  {
    "path": "src/models/order.py",
    "content": "\"\"\"Order domain model and total calculation.\"\"\"\nfrom typing import List, Dict, Any\nfrom src.models.base import BaseModel\n\n\nclass Order(BaseModel):\n    \"\"\"Customer purchase order representing cart checkout.\"\"\"\n\n    def __init__(self, id: str, user_id: str, items: List[Dict[str, Any]]):\n        super().__init__(id)\n        self.user_id = user_id\n        self.items = items\n        self.status = \"pending\"\n        self.total = self.calculate_total()\n\n    def calculate_total(self) -> float:\n        \"\"\"Sum price multiplied by quantity across all line items.\"\"\"\n        return sum(item.get(\"price\", 0.0) * item.get(\"quantity\", 1) for item in self.items)\n\n    def is_cancellable(self) -> bool:\n        \"\"\"Determine if order state permits customer cancellation.\"\"\"\n        return self.status in (\"pending\", \"payment_failed\")\n\n    def add_item(self, item: Dict[str, Any]) -> None:\n        \"\"\"Append line item and recalculate total order cost.\"\"\"\n        self.items.append(item)\n        self.total = self.calculate_total()\n\n    def to_dict(self) -> Dict[str, Any]:\n        \"\"\"Serialize order details into dictionary representation.\"\"\"\n        data = super().to_dict()\n        data.update({\"user_id\": self.user_id, \"status\": self.status, \"total\": self.total})\n        return data\n",
    "language": "python",
    "lines": 33,
    "analyzed": true,
    "symbols": [
      "Order",
      "Order.calculate_total",
      "Order.is_cancellable",
      "Order.add_item",
      "Order.to_dict"
    ]
  },
  {
    "path": "src/models/payment.py",
    "content": "\"\"\"Payment transactions and refund class hierarchy.\"\"\"\nfrom typing import Dict, Any\nfrom src.models.base import BaseModel\nfrom src.utils.validators import validate_amount, validate_currency\n\n\nclass Payment(BaseModel):\n    \"\"\"Core payment transaction record for billing.\"\"\"\n\n    def __init__(self, id: str, order_id: str, amount: float, currency: str = \"USD\"):\n        super().__init__(id)\n        validate_amount(amount)\n        validate_currency(currency)\n        self.order_id = order_id\n        self.amount = amount\n        self.currency = currency\n        self.status = \"created\"\n\n    def process(self) -> bool:\n        \"\"\"Execute settlement flow for standard payment capture.\"\"\"\n        self.status = \"processed\"\n        return True\n\n\nclass RefundPayment(Payment):\n    \"\"\"Reversal transaction derived from an original payment.\"\"\"\n\n    def __init__(self, id: str, original_payment_id: str, amount: float, reason: str):\n        super().__init__(id=id, order_id=original_payment_id, amount=amount)\n        self.original_payment_id = original_payment_id\n        self.reason = reason\n\n    def process_refund(self) -> bool:\n        \"\"\"Reverse settlement and credit original payment method.\"\"\"\n        self.status = \"refunded\"\n        return True\n",
    "language": "python",
    "lines": 36,
    "analyzed": true,
    "symbols": [
      "Payment",
      "Payment.process",
      "RefundPayment",
      "RefundPayment.process_refund"
    ]
  },
  {
    "path": "src/services/auth_service.py",
    "content": "\"\"\"Authentication and token verification service.\"\"\"\nimport hashlib\nfrom typing import Optional, Dict\nfrom src.utils.validators import validate_email\nfrom src.utils.logger import get_logger\nfrom src.models.user import User\n\nlogger = get_logger()\n\n\ndef hash_password(password: str) -> str:\n    \"\"\"Generate SHA-256 password hash for secure verification.\"\"\"\n    return hashlib.sha256(password.encode(\"utf-8\")).hexdigest()\n\n\ndef authenticate_user(email: str, password: str) -> Optional[User]:\n    \"\"\"Verify credentials and return user model if valid.\"\"\"\n    logger.info(\"Attempting authentication for email\")\n    if not validate_email(email):\n        return None\n    user = User(id=\"user-1\", email=email)\n    if user.is_active():\n        return user\n    return None\n\n\ndef verify_jwt_token(token: str) -> Optional[Dict[str, str]]:\n    \"\"\"Decode and validate bearer authentication token.\"\"\"\n    if not token or len(token) < 10:\n        return None\n    return {\"sub\": \"user-1\", \"role\": \"admin\"}\n\n\ndef generate_session_token(user_id: str) -> str:\n    \"\"\"Create short-lived authorization token for active user.\"\"\"\n    return f\"sess_{user_id}_jwt_devgraph\"\n",
    "language": "python",
    "lines": 36,
    "analyzed": true,
    "symbols": [
      "hash_password",
      "authenticate_user",
      "verify_jwt_token",
      "generate_session_token"
    ]
  },
  {
    "path": "src/services/payment_service.py",
    "content": "\"\"\"Payment settlement gateway and refund processing.\"\"\"\nfrom typing import Dict, Any, Optional\nfrom src.utils.validators import validate_amount, validate_currency\nfrom src.utils.logger import get_logger, mask_sensitive_data\nfrom src.models.payment import Payment, RefundPayment\n\nlogger = get_logger()\n\n\ndef validate_gateway_config() -> bool:\n    \"\"\"Verify payment gateway credentials and connectivity.\"\"\"\n    return True\n\n\ndef charge_payment(order_id: str, amount: float, payment_method: Dict[str, Any]) -> Payment:\n    \"\"\"Authorize and charge funds against customer payment method.\"\"\"\n    sanitized = mask_sensitive_data(payment_method)\n    logger.info(f\"Charging payment for order {order_id} details: {sanitized}\")\n    if not validate_amount(amount):\n        raise ValueError(\"Invalid payment amount specified\")\n    validate_currency(payment_method.get(\"currency\", \"USD\"))\n    payment = Payment(id=f\"pay_{order_id}\", order_id=order_id, amount=amount)\n    payment.process()\n    return payment\n\n\ndef refund_transaction(payment_id: str, amount: float, reason: str) -> RefundPayment:\n    \"\"\"Issue full or partial refund against captured transaction.\"\"\"\n    logger.info(f\"Initiating refund for payment {payment_id}\")\n    validate_amount(amount)\n    refund = RefundPayment(id=f\"ref_{payment_id}\", original_payment_id=payment_id, amount=amount, reason=reason)\n    refund.process_refund()\n    return refund\n\n\ndef get_payment_status(payment_id: str) -> Optional[str]:\n    \"\"\"Query settlement status from billing gateway provider.\"\"\"\n    return \"settled\"\n",
    "language": "python",
    "lines": 38,
    "analyzed": true,
    "symbols": [
      "validate_gateway_config",
      "charge_payment",
      "refund_transaction",
      "get_payment_status"
    ]
  },
  {
    "path": "src/services/order_service.py",
    "content": "\"\"\"Order management service handling lifecycle and fulfillment.\"\"\"\nfrom typing import List, Dict, Any, Optional\nfrom src.utils.validators import validate_uuid, validate_amount\nfrom src.utils.logger import get_logger\nfrom src.models.order import Order\nfrom src.services.payment_service import charge_payment\nfrom src.services.notification_service import send_order_confirmation\n\nlogger = get_logger()\n\n\ndef validate_order_items(items: List[Dict[str, Any]]) -> bool:\n    \"\"\"Ensure cart contains valid items with positive pricing.\"\"\"\n    if not items:\n        return False\n    return all(validate_amount(item.get(\"price\", 0.0)) for item in items)\n\n\ndef create_order(user_id: str, items: List[Dict[str, Any]], payment_method: Dict[str, Any]) -> Order:\n    \"\"\"Orchestrate cart checkout, payment charge, and confirmation.\"\"\"\n    logger.info(f\"Creating order for user {user_id}\")\n    validate_uuid(user_id)\n    order = Order(id=f\"ord_{user_id}\", user_id=user_id, items=items)\n    validate_order_items(items)\n    validate_amount(order.total)\n    charge_payment(order.id, order.total, payment_method)\n    send_order_confirmation(user_id, order.id)\n    return order\n\n\ndef cancel_order(order_id: str) -> bool:\n    \"\"\"Mark pending order as cancelled if permissible.\"\"\"\n    logger.info(f\"Cancelling order {order_id}\")\n    return True\n\n\ndef get_order_by_id(order_id: str) -> Optional[Order]:\n    \"\"\"Fetch order record by primary identifier.\"\"\"\n    validate_uuid(order_id)\n    return Order(id=order_id, user_id=\"user-1\", items=[])\n",
    "language": "python",
    "lines": 40,
    "analyzed": true,
    "symbols": [
      "validate_order_items",
      "create_order",
      "cancel_order",
      "get_order_by_id"
    ]
  },
  {
    "path": "src/services/notification_service.py",
    "content": "\"\"\"Outbound customer notification dispatching service.\"\"\"\nfrom typing import Optional\nfrom src.utils.logger import get_logger\nfrom src.utils.validators import validate_email\n\nlogger = get_logger()\n\n\ndef send_order_confirmation(user_id: str, order_id: str) -> bool:\n    \"\"\"Dispatch order confirmation notification to customer.\"\"\"\n    logger.info(f\"Sending order confirmation for order {order_id} to user {user_id}\")\n    return True\n\n\ndef send_payment_receipt(email: str, amount: float, transaction_id: str) -> bool:\n    \"\"\"Send itemized payment invoice to customer email.\"\"\"\n    if not validate_email(email):\n        logger.warning(f\"Invalid email recipient: {email}\")\n        return False\n    logger.info(f\"Receipt for {transaction_id} amount {amount} dispatched\")\n    return True\n\n\ndef format_notification_template(event_name: str, payload: dict) -> str:\n    \"\"\"Format notification markdown message body with metadata.\"\"\"\n    return f\"[{event_name}] Details: {payload}\"\n",
    "language": "python",
    "lines": 26,
    "analyzed": true,
    "symbols": [
      "send_order_confirmation",
      "send_payment_receipt",
      "format_notification_template"
    ]
  },
  {
    "path": "src/api/deps.py",
    "content": "\"\"\"API dependency injection providers and context helpers.\"\"\"\nfrom typing import Optional, Dict, Any\nfrom src.services.auth_service import verify_jwt_token\nfrom src.models.user import User\n\n\ndef get_current_user(token: Optional[str] = None) -> Optional[User]:\n    \"\"\"Extract authenticated user session from request bearer token.\"\"\"\n    if not token:\n        return None\n    claims = verify_jwt_token(token)\n    if not claims:\n        return None\n    return User(id=claims[\"sub\"], email=\"user@acme.com\")\n\n\ndef get_db_session() -> Dict[str, str]:\n    \"\"\"Provide scoped database session context.\"\"\"\n    return {\"status\": \"connected\", \"engine\": \"postgresql\"}\n\n\ndef check_admin_privileges(user: User) -> bool:\n    \"\"\"Ensure authenticated identity has administrative authorization.\"\"\"\n    return user.role == \"admin\"\n",
    "language": "python",
    "lines": 24,
    "analyzed": true,
    "symbols": [
      "get_current_user",
      "get_db_session",
      "check_admin_privileges"
    ]
  },
  {
    "path": "src/api/orders.py",
    "content": "\"\"\"Order HTTP route controllers and request handlers.\"\"\"\nfrom typing import Dict, Any\nfrom src.utils.validators import validate_uuid\nfrom src.services.order_service import create_order, get_order_by_id\nfrom src.models.order import Order\n\n\ndef place_order(payload: Dict[str, Any]) -> Dict[str, Any]:\n    \"\"\"Entry point HTTP handler to validate and place customer order.\"\"\"\n    user_id = payload.get(\"user_id\", \"\")\n    items = payload.get(\"items\", [])\n    payment_method = payload.get(\"payment_method\", {})\n    validate_uuid(user_id)\n    order: Order = create_order(user_id, items, payment_method)\n    return {\n        \"status\": \"success\",\n        \"order_id\": order.id,\n        \"total\": order.total,\n    }\n\n\ndef fetch_order_status(order_id: str) -> Dict[str, Any]:\n    \"\"\"Retrieve current processing state for specified order.\"\"\"\n    validate_uuid(order_id)\n    order = get_order_by_id(order_id)\n    if not order:\n        return {\"error\": \"Order not found\"}\n    return {\"order_id\": order.id, \"cancellable\": order.is_cancellable()}\n",
    "language": "python",
    "lines": 28,
    "analyzed": true,
    "symbols": [
      "place_order",
      "fetch_order_status"
    ]
  },
  {
    "path": "src/api/payments.py",
    "content": "\"\"\"Payment HTTP endpoints for checkout and refunds.\"\"\"\nfrom typing import Dict, Any\nfrom src.utils.validators import validate_currency\nfrom src.services.payment_service import charge_payment, refund_transaction\nfrom src.models.payment import Payment\n\n\ndef initiate_checkout(payload: Dict[str, Any]) -> Dict[str, Any]:\n    \"\"\"Handle checkout request and trigger payment processing.\"\"\"\n    order_id = payload.get(\"order_id\", \"\")\n    amount = float(payload.get(\"amount\", 0.0))\n    currency = payload.get(\"currency\", \"USD\")\n    validate_currency(currency)\n    payment: Payment = charge_payment(order_id, amount, {\"currency\": currency})\n    return {\"status\": \"authorized\", \"payment_id\": payment.id}\n\n\ndef request_refund(payload: Dict[str, Any]) -> Dict[str, Any]:\n    \"\"\"Process customer refund request via payment service.\"\"\"\n    payment_id = payload.get(\"payment_id\", \"\")\n    amount = float(payload.get(\"amount\", 0.0))\n    reason = payload.get(\"reason\", \"customer_request\")\n    refund = refund_transaction(payment_id, amount, reason)\n    return {\"status\": \"refunded\", \"refund_id\": refund.id}\n",
    "language": "python",
    "lines": 24,
    "analyzed": true,
    "symbols": [
      "initiate_checkout",
      "request_refund"
    ]
  },
  {
    "path": "tests/test_orders.py",
    "content": "\"\"\"Unit and integration test cases for order workflow.\"\"\"\nfrom src.api.orders import place_order\nfrom src.services.order_service import create_order\nfrom src.utils.validators import validate_amount\n\n\ndef test_place_order_success():\n    \"\"\"Verify placing a valid customer order completes successfully.\"\"\"\n    payload = {\n        \"user_id\": \"a1b2c3d4-e5f6-7890-abcd-ef1234567890\",\n        \"items\": [{\"price\": 49.99, \"quantity\": 2}],\n        \"payment_method\": {\"currency\": \"USD\"},\n    }\n    result = place_order(payload)\n    assert result[\"status\"] == \"success\"\n    assert result[\"total\"] == 99.98\n\n\ndef test_create_order_invalid_amount():\n    \"\"\"Ensure order creation validates monetary values appropriately.\"\"\"\n    assert validate_amount(10.0) is True\n    assert validate_amount(-5.0) is False\n",
    "language": "python",
    "lines": 22,
    "analyzed": true,
    "symbols": [
      "test_place_order_success",
      "test_create_order_invalid_amount"
    ]
  },
  {
    "path": "tests/test_payments.py",
    "content": "\"\"\"Integration tests verifying payments and refund hierarchy.\"\"\"\nfrom src.services.payment_service import charge_payment\nfrom src.models.payment import Payment, RefundPayment\n\n\ndef test_charge_payment_flow():\n    \"\"\"Ensure payment charging creates and processes payment record.\"\"\"\n    payment = charge_payment(\"ord-999\", 150.0, {\"currency\": \"USD\"})\n    assert isinstance(payment, Payment)\n    assert payment.amount == 150.0\n    assert payment.process() is True\n\n\ndef test_refund_payment_inheritance():\n    \"\"\"Test RefundPayment sub-classing and refund processing.\"\"\"\n    refund = RefundPayment(\"ref-123\", \"pay-999\", 50.0, \"defective_item\")\n    assert isinstance(refund, Payment)\n    assert refund.process_refund() is True\n\n\ndef test_payment_zero_amount():\n    \"\"\"Verify payment instantiation rejects zero or negative amounts.\"\"\"\n    try:\n        Payment(id=\"p-err\", order_id=\"ord-err\", amount=0.0)\n    except Exception:\n        pass\n",
    "language": "python",
    "lines": 26,
    "analyzed": true,
    "symbols": [
      "test_charge_payment_flow",
      "test_refund_payment_inheritance",
      "test_payment_zero_amount"
    ]
  },
  {
    "path": "README.md",
    "content": "# acme/my-store\n\nE-commerce microservice architecture built with Python, FastAPI, and modular payment handlers.\n\n## Architecture\n\n- `src/api`: FastAPI endpoint handlers and dependency injection.\n- `src/services`: Core business logic for authentication, checkout, orders, and payment capture.\n- `src/models`: Object models and domain entities.\n- `src/utils`: Reusable validation, logging, and hashing primitives.\n- `tests`: Pytest test suite.\n\n## Development\n\n```bash\npip install -r requirements.txt\npytest\n```\n",
    "language": "markdown",
    "lines": 18,
    "analyzed": false,
    "symbols": []
  },
  {
    "path": "requirements.txt",
    "content": "fastapi>=0.110.0\nuvicorn>=0.28.0\npydantic>=2.6.0\npytest>=8.0.0\nrequests>=2.31.0\ncryptography>=42.0.0\n",
    "language": "text",
    "lines": 6,
    "analyzed": false,
    "symbols": []
  }
];

export const MOCK_SYMBOLS: GraphNode[] = [
  {
    "id": "validate_email",
    "label": "validate_email",
    "kind": "function",
    "file": "src/utils/validators.py",
    "start_line": 10,
    "end_line": 14,
    "description": "Validate that an email string conforms to standard email format."
  },
  {
    "id": "validate_amount",
    "label": "validate_amount",
    "kind": "function",
    "file": "src/utils/validators.py",
    "start_line": 17,
    "end_line": 21,
    "description": "Validate that a monetary transaction amount is positive and non-zero."
  },
  {
    "id": "validate_uuid",
    "label": "validate_uuid",
    "kind": "function",
    "file": "src/utils/validators.py",
    "start_line": 24,
    "end_line": 28,
    "description": "Validate string representation of standard UUID v4 format."
  },
  {
    "id": "validate_currency",
    "label": "validate_currency",
    "kind": "function",
    "file": "src/utils/validators.py",
    "start_line": 31,
    "end_line": 35,
    "description": "Ensure the specified currency code is supported in our system."
  },
  {
    "id": "sanitize_input",
    "label": "sanitize_input",
    "kind": "function",
    "file": "src/utils/validators.py",
    "start_line": 38,
    "end_line": 42,
    "description": "Strip dangerous characters and excess whitespace from user string."
  },
  {
    "id": "configure_logger",
    "label": "configure_logger",
    "kind": "function",
    "file": "src/utils/logger.py",
    "start_line": 9,
    "end_line": 16,
    "description": "Initialize and configure global logger instance with formatting."
  },
  {
    "id": "get_logger",
    "label": "get_logger",
    "kind": "function",
    "file": "src/utils/logger.py",
    "start_line": 19,
    "end_line": 24,
    "description": "Retrieve the singleton logger instance or create default."
  },
  {
    "id": "mask_sensitive_data",
    "label": "mask_sensitive_data",
    "kind": "function",
    "file": "src/utils/logger.py",
    "start_line": 27,
    "end_line": 33,
    "description": "Sanitize payment and authentication credentials in log dictionaries."
  },
  {
    "id": "calculate_checksum",
    "label": "calculate_checksum",
    "kind": "function",
    "file": "src/utils/isolated_calc.py",
    "start_line": 6,
    "end_line": 12,
    "description": "Calculate MD5 checksum for binary or string payload."
  },
  {
    "id": "compute_sha256_digest",
    "label": "compute_sha256_digest",
    "kind": "function",
    "file": "src/utils/isolated_calc.py",
    "start_line": 15,
    "end_line": 19,
    "description": "Compute standard SHA-256 digest string for verification."
  },
  {
    "id": "verify_payload_integrity",
    "label": "verify_payload_integrity",
    "kind": "function",
    "file": "src/utils/isolated_calc.py",
    "start_line": 22,
    "end_line": 25,
    "description": "Verify raw byte sequence matches anticipated SHA-256 fingerprint."
  },
  {
    "id": "BaseModel",
    "label": "BaseModel",
    "kind": "class",
    "file": "src/models/base.py",
    "start_line": 6,
    "end_line": 25,
    "description": "Abstract entity with unique identifier and audit timestamps."
  },
  {
    "id": "BaseModel.to_dict",
    "label": "to_dict",
    "kind": "method",
    "file": "src/models/base.py",
    "start_line": 14,
    "end_line": 20,
    "description": "Serialize entity attributes to standard Python dictionary."
  },
  {
    "id": "BaseModel.from_dict",
    "label": "from_dict",
    "kind": "method",
    "file": "src/models/base.py",
    "start_line": 23,
    "end_line": 25,
    "description": "Deserialize raw dictionary into entity instance."
  },
  {
    "id": "User",
    "label": "User",
    "kind": "class",
    "file": "src/models/user.py",
    "start_line": 7,
    "end_line": 29,
    "description": "Registered application user account."
  },
  {
    "id": "User.is_active",
    "label": "is_active",
    "kind": "method",
    "file": "src/models/user.py",
    "start_line": 17,
    "end_line": 19,
    "description": "Check whether the user account is active and permitted access."
  },
  {
    "id": "User.get_display_name",
    "label": "get_display_name",
    "kind": "method",
    "file": "src/models/user.py",
    "start_line": 21,
    "end_line": 23,
    "description": "Return username portion of email for interface presentation."
  },
  {
    "id": "User.to_dict",
    "label": "to_dict",
    "kind": "method",
    "file": "src/models/user.py",
    "start_line": 25,
    "end_line": 29,
    "description": "Serialize user account data including email and role."
  },
  {
    "id": "Order",
    "label": "Order",
    "kind": "class",
    "file": "src/models/order.py",
    "start_line": 6,
    "end_line": 33,
    "description": "Customer purchase order representing cart checkout."
  },
  {
    "id": "Order.calculate_total",
    "label": "calculate_total",
    "kind": "method",
    "file": "src/models/order.py",
    "start_line": 16,
    "end_line": 18,
    "description": "Sum price multiplied by quantity across all line items."
  },
  {
    "id": "Order.is_cancellable",
    "label": "is_cancellable",
    "kind": "method",
    "file": "src/models/order.py",
    "start_line": 20,
    "end_line": 22,
    "description": "Determine if order state permits customer cancellation."
  },
  {
    "id": "Order.add_item",
    "label": "add_item",
    "kind": "method",
    "file": "src/models/order.py",
    "start_line": 24,
    "end_line": 27,
    "description": "Append line item and recalculate total order cost."
  },
  {
    "id": "Order.to_dict",
    "label": "to_dict",
    "kind": "method",
    "file": "src/models/order.py",
    "start_line": 29,
    "end_line": 33,
    "description": "Serialize order details into dictionary representation."
  },
  {
    "id": "Payment",
    "label": "Payment",
    "kind": "class",
    "file": "src/models/payment.py",
    "start_line": 7,
    "end_line": 22,
    "description": "Core payment transaction record for billing."
  },
  {
    "id": "Payment.process",
    "label": "process",
    "kind": "method",
    "file": "src/models/payment.py",
    "start_line": 19,
    "end_line": 22,
    "description": "Execute settlement flow for standard payment capture."
  },
  {
    "id": "RefundPayment",
    "label": "RefundPayment",
    "kind": "class",
    "file": "src/models/payment.py",
    "start_line": 25,
    "end_line": 36,
    "description": "Reversal transaction derived from an original payment."
  },
  {
    "id": "RefundPayment.process_refund",
    "label": "process_refund",
    "kind": "method",
    "file": "src/models/payment.py",
    "start_line": 33,
    "end_line": 36,
    "description": "Reverse settlement and credit original payment method."
  },
  {
    "id": "hash_password",
    "label": "hash_password",
    "kind": "function",
    "file": "src/services/auth_service.py",
    "start_line": 11,
    "end_line": 13,
    "description": "Generate SHA-256 password hash for secure verification."
  },
  {
    "id": "authenticate_user",
    "label": "authenticate_user",
    "kind": "function",
    "file": "src/services/auth_service.py",
    "start_line": 16,
    "end_line": 24,
    "description": "Verify credentials and return user model if valid."
  },
  {
    "id": "verify_jwt_token",
    "label": "verify_jwt_token",
    "kind": "function",
    "file": "src/services/auth_service.py",
    "start_line": 27,
    "end_line": 31,
    "description": "Decode and validate bearer authentication token."
  },
  {
    "id": "generate_session_token",
    "label": "generate_session_token",
    "kind": "function",
    "file": "src/services/auth_service.py",
    "start_line": 34,
    "end_line": 36,
    "description": "Create short-lived authorization token for active user."
  },
  {
    "id": "validate_gateway_config",
    "label": "validate_gateway_config",
    "kind": "function",
    "file": "src/services/payment_service.py",
    "start_line": 10,
    "end_line": 12,
    "description": "Verify payment gateway credentials and connectivity."
  },
  {
    "id": "charge_payment",
    "label": "charge_payment",
    "kind": "function",
    "file": "src/services/payment_service.py",
    "start_line": 15,
    "end_line": 24,
    "description": "Authorize and charge funds against customer payment method."
  },
  {
    "id": "refund_transaction",
    "label": "refund_transaction",
    "kind": "function",
    "file": "src/services/payment_service.py",
    "start_line": 27,
    "end_line": 33,
    "description": "Issue full or partial refund against captured transaction."
  },
  {
    "id": "get_payment_status",
    "label": "get_payment_status",
    "kind": "function",
    "file": "src/services/payment_service.py",
    "start_line": 36,
    "end_line": 38,
    "description": "Query settlement status from billing gateway provider."
  },
  {
    "id": "validate_order_items",
    "label": "validate_order_items",
    "kind": "function",
    "file": "src/services/order_service.py",
    "start_line": 12,
    "end_line": 16,
    "description": "Ensure cart contains valid items with positive pricing."
  },
  {
    "id": "create_order",
    "label": "create_order",
    "kind": "function",
    "file": "src/services/order_service.py",
    "start_line": 19,
    "end_line": 28,
    "description": "Orchestrate cart checkout, payment charge, and confirmation."
  },
  {
    "id": "cancel_order",
    "label": "cancel_order",
    "kind": "function",
    "file": "src/services/order_service.py",
    "start_line": 31,
    "end_line": 34,
    "description": "Mark pending order as cancelled if permissible."
  },
  {
    "id": "get_order_by_id",
    "label": "get_order_by_id",
    "kind": "function",
    "file": "src/services/order_service.py",
    "start_line": 37,
    "end_line": 40,
    "description": "Fetch order record by primary identifier."
  },
  {
    "id": "send_order_confirmation",
    "label": "send_order_confirmation",
    "kind": "function",
    "file": "src/services/notification_service.py",
    "start_line": 9,
    "end_line": 12,
    "description": "Dispatch order confirmation notification to customer."
  },
  {
    "id": "send_payment_receipt",
    "label": "send_payment_receipt",
    "kind": "function",
    "file": "src/services/notification_service.py",
    "start_line": 15,
    "end_line": 21,
    "description": "Send itemized payment invoice to customer email."
  },
  {
    "id": "format_notification_template",
    "label": "format_notification_template",
    "kind": "function",
    "file": "src/services/notification_service.py",
    "start_line": 24,
    "end_line": 26,
    "description": "Format notification markdown message body with metadata."
  },
  {
    "id": "get_current_user",
    "label": "get_current_user",
    "kind": "function",
    "file": "src/api/deps.py",
    "start_line": 7,
    "end_line": 14,
    "description": "Extract authenticated user session from request bearer token."
  },
  {
    "id": "get_db_session",
    "label": "get_db_session",
    "kind": "function",
    "file": "src/api/deps.py",
    "start_line": 17,
    "end_line": 19,
    "description": "Provide scoped database session context."
  },
  {
    "id": "check_admin_privileges",
    "label": "check_admin_privileges",
    "kind": "function",
    "file": "src/api/deps.py",
    "start_line": 22,
    "end_line": 24,
    "description": "Ensure authenticated identity has administrative authorization."
  },
  {
    "id": "place_order",
    "label": "place_order",
    "kind": "function",
    "file": "src/api/orders.py",
    "start_line": 8,
    "end_line": 19,
    "description": "Entry point HTTP handler to validate and place customer order."
  },
  {
    "id": "fetch_order_status",
    "label": "fetch_order_status",
    "kind": "function",
    "file": "src/api/orders.py",
    "start_line": 22,
    "end_line": 28,
    "description": "Retrieve current processing state for specified order."
  },
  {
    "id": "initiate_checkout",
    "label": "initiate_checkout",
    "kind": "function",
    "file": "src/api/payments.py",
    "start_line": 8,
    "end_line": 15,
    "description": "Handle checkout request and trigger payment processing."
  },
  {
    "id": "request_refund",
    "label": "request_refund",
    "kind": "function",
    "file": "src/api/payments.py",
    "start_line": 18,
    "end_line": 24,
    "description": "Process customer refund request via payment service."
  },
  {
    "id": "test_place_order_success",
    "label": "test_place_order_success",
    "kind": "function",
    "file": "tests/test_orders.py",
    "start_line": 7,
    "end_line": 16,
    "description": "Verify placing a valid customer order completes successfully."
  },
  {
    "id": "test_create_order_invalid_amount",
    "label": "test_create_order_invalid_amount",
    "kind": "function",
    "file": "tests/test_orders.py",
    "start_line": 19,
    "end_line": 22,
    "description": "Ensure order creation validates monetary values appropriately."
  },
  {
    "id": "test_charge_payment_flow",
    "label": "test_charge_payment_flow",
    "kind": "function",
    "file": "tests/test_payments.py",
    "start_line": 6,
    "end_line": 11,
    "description": "Ensure payment charging creates and processes payment record."
  },
  {
    "id": "test_refund_payment_inheritance",
    "label": "test_refund_payment_inheritance",
    "kind": "function",
    "file": "tests/test_payments.py",
    "start_line": 14,
    "end_line": 18,
    "description": "Test RefundPayment sub-classing and refund processing."
  },
  {
    "id": "test_payment_zero_amount",
    "label": "test_payment_zero_amount",
    "kind": "function",
    "file": "tests/test_payments.py",
    "start_line": 21,
    "end_line": 26,
    "description": "Verify payment instantiation rejects zero or negative amounts."
  }
];

export const MOCK_EDGES: GraphEdge[] = [
  {
    "id": "e-1",
    "source": "User",
    "target": "BaseModel",
    "kind": "inherits",
    "line": 7,
    "resolved": true
  },
  {
    "id": "e-2",
    "source": "Order",
    "target": "BaseModel",
    "kind": "inherits",
    "line": 6,
    "resolved": true
  },
  {
    "id": "e-3",
    "source": "Payment",
    "target": "BaseModel",
    "kind": "inherits",
    "line": 7,
    "resolved": true
  },
  {
    "id": "e-4",
    "source": "RefundPayment",
    "target": "Payment",
    "kind": "inherits",
    "line": 25,
    "resolved": true
  },
  {
    "id": "e-5",
    "source": "place_order",
    "target": "create_order",
    "kind": "calls",
    "line": 14,
    "resolved": true
  },
  {
    "id": "e-6",
    "source": "create_order",
    "target": "charge_payment",
    "kind": "calls",
    "line": 26,
    "resolved": true
  },
  {
    "id": "e-7",
    "source": "charge_payment",
    "target": "validate_amount",
    "kind": "calls",
    "line": 18,
    "resolved": true
  },
  {
    "id": "e-8",
    "source": "User",
    "target": "validate_email",
    "kind": "calls",
    "line": 12,
    "resolved": true
  },
  {
    "id": "e-9",
    "source": "authenticate_user",
    "target": "validate_email",
    "kind": "calls",
    "line": 17,
    "resolved": true
  },
  {
    "id": "e-10",
    "source": "send_payment_receipt",
    "target": "validate_email",
    "kind": "calls",
    "line": 17,
    "resolved": true
  },
  {
    "id": "e-11",
    "source": "Payment",
    "target": "validate_amount",
    "kind": "calls",
    "line": 12,
    "resolved": true
  },
  {
    "id": "e-12",
    "source": "refund_transaction",
    "target": "validate_amount",
    "kind": "calls",
    "line": 28,
    "resolved": true
  },
  {
    "id": "e-13",
    "source": "validate_order_items",
    "target": "validate_amount",
    "kind": "calls",
    "line": 16,
    "resolved": true
  },
  {
    "id": "e-14",
    "source": "create_order",
    "target": "validate_amount",
    "kind": "calls",
    "line": 25,
    "resolved": true
  },
  {
    "id": "e-15",
    "source": "test_create_order_invalid_amount",
    "target": "validate_amount",
    "kind": "calls",
    "line": 20,
    "resolved": true
  },
  {
    "id": "e-16",
    "source": "create_order",
    "target": "validate_uuid",
    "kind": "calls",
    "line": 22,
    "resolved": true
  },
  {
    "id": "e-17",
    "source": "get_order_by_id",
    "target": "validate_uuid",
    "kind": "calls",
    "line": 38,
    "resolved": true
  },
  {
    "id": "e-18",
    "source": "place_order",
    "target": "validate_uuid",
    "kind": "calls",
    "line": 13,
    "resolved": true
  },
  {
    "id": "e-19",
    "source": "fetch_order_status",
    "target": "validate_uuid",
    "kind": "calls",
    "line": 25,
    "resolved": true
  },
  {
    "id": "e-20",
    "source": "Payment",
    "target": "validate_currency",
    "kind": "calls",
    "line": 13,
    "resolved": true
  },
  {
    "id": "e-21",
    "source": "charge_payment",
    "target": "validate_currency",
    "kind": "calls",
    "line": 20,
    "resolved": true
  },
  {
    "id": "e-22",
    "source": "initiate_checkout",
    "target": "validate_currency",
    "kind": "calls",
    "line": 14,
    "resolved": true
  },
  {
    "id": "e-23",
    "source": "authenticate_user",
    "target": "get_logger",
    "kind": "calls",
    "line": 8,
    "resolved": true
  },
  {
    "id": "e-24",
    "source": "charge_payment",
    "target": "get_logger",
    "kind": "calls",
    "line": 7,
    "resolved": true
  },
  {
    "id": "e-25",
    "source": "refund_transaction",
    "target": "get_logger",
    "kind": "calls",
    "line": 27,
    "resolved": true
  },
  {
    "id": "e-26",
    "source": "charge_payment",
    "target": "mask_sensitive_data",
    "kind": "calls",
    "line": 16,
    "resolved": true
  },
  {
    "id": "e-27",
    "source": "create_order",
    "target": "get_logger",
    "kind": "calls",
    "line": 9,
    "resolved": true
  },
  {
    "id": "e-28",
    "source": "cancel_order",
    "target": "get_logger",
    "kind": "calls",
    "line": 32,
    "resolved": true
  },
  {
    "id": "e-29",
    "source": "send_order_confirmation",
    "target": "get_logger",
    "kind": "calls",
    "line": 6,
    "resolved": true
  },
  {
    "id": "e-30",
    "source": "get_logger",
    "target": "configure_logger",
    "kind": "calls",
    "line": 21,
    "resolved": true
  },
  {
    "id": "e-31",
    "source": "Order",
    "target": "Order.calculate_total",
    "kind": "calls",
    "line": 15,
    "resolved": true
  },
  {
    "id": "e-32",
    "source": "Order.add_item",
    "target": "Order.calculate_total",
    "kind": "calls",
    "line": 24,
    "resolved": true
  },
  {
    "id": "e-33",
    "source": "create_order",
    "target": "Order",
    "kind": "calls",
    "line": 23,
    "resolved": true
  },
  {
    "id": "e-34",
    "source": "create_order",
    "target": "validate_order_items",
    "kind": "calls",
    "line": 24,
    "resolved": true
  },
  {
    "id": "e-35",
    "source": "create_order",
    "target": "send_order_confirmation",
    "kind": "calls",
    "line": 27,
    "resolved": true
  },
  {
    "id": "e-36",
    "source": "get_order_by_id",
    "target": "Order",
    "kind": "calls",
    "line": 39,
    "resolved": true
  },
  {
    "id": "e-37",
    "source": "fetch_order_status",
    "target": "get_order_by_id",
    "kind": "calls",
    "line": 26,
    "resolved": true
  },
  {
    "id": "e-38",
    "source": "charge_payment",
    "target": "Payment",
    "kind": "calls",
    "line": 21,
    "resolved": true
  },
  {
    "id": "e-39",
    "source": "refund_transaction",
    "target": "RefundPayment",
    "kind": "calls",
    "line": 29,
    "resolved": true
  },
  {
    "id": "e-40",
    "source": "initiate_checkout",
    "target": "charge_payment",
    "kind": "calls",
    "line": 15,
    "resolved": true
  },
  {
    "id": "e-41",
    "source": "request_refund",
    "target": "refund_transaction",
    "kind": "calls",
    "line": 23,
    "resolved": true
  },
  {
    "id": "e-42",
    "source": "authenticate_user",
    "target": "User",
    "kind": "calls",
    "line": 19,
    "resolved": true
  },
  {
    "id": "e-43",
    "source": "get_current_user",
    "target": "verify_jwt_token",
    "kind": "calls",
    "line": 11,
    "resolved": true
  },
  {
    "id": "e-44",
    "source": "get_current_user",
    "target": "User",
    "kind": "calls",
    "line": 14,
    "resolved": true
  },
  {
    "id": "e-45",
    "source": "check_admin_privileges",
    "target": "User",
    "kind": "calls",
    "line": 22,
    "resolved": true
  },
  {
    "id": "e-46",
    "source": "test_place_order_success",
    "target": "place_order",
    "kind": "calls",
    "line": 13,
    "resolved": true
  },
  {
    "id": "e-47",
    "source": "test_create_order_invalid_amount",
    "target": "create_order",
    "kind": "calls",
    "line": 21,
    "resolved": true
  },
  {
    "id": "e-48",
    "source": "test_charge_payment_flow",
    "target": "charge_payment",
    "kind": "calls",
    "line": 7,
    "resolved": true
  },
  {
    "id": "e-49",
    "source": "test_refund_payment_inheritance",
    "target": "RefundPayment",
    "kind": "calls",
    "line": 15,
    "resolved": true
  },
  {
    "id": "e-50",
    "source": "test_refund_payment_inheritance",
    "target": "RefundPayment.process_refund",
    "kind": "calls",
    "line": 17,
    "resolved": true
  },
  {
    "id": "e-51",
    "source": "test_payment_zero_amount",
    "target": "Payment",
    "kind": "calls",
    "line": 23,
    "resolved": true
  },
  {
    "id": "e-52",
    "source": "User",
    "target": "BaseModel",
    "kind": "imports",
    "line": 3,
    "resolved": true
  },
  {
    "id": "e-53",
    "source": "User",
    "target": "validate_email",
    "kind": "imports",
    "line": 4,
    "resolved": true
  },
  {
    "id": "e-54",
    "source": "Order",
    "target": "BaseModel",
    "kind": "imports",
    "line": 3,
    "resolved": true
  },
  {
    "id": "e-55",
    "source": "Payment",
    "target": "BaseModel",
    "kind": "imports",
    "line": 3,
    "resolved": true
  },
  {
    "id": "e-56",
    "source": "Payment",
    "target": "validate_amount",
    "kind": "imports",
    "line": 4,
    "resolved": true
  },
  {
    "id": "e-57",
    "source": "Payment",
    "target": "validate_currency",
    "kind": "imports",
    "line": 4,
    "resolved": true
  },
  {
    "id": "e-58",
    "source": "authenticate_user",
    "target": "User",
    "kind": "imports",
    "line": 6,
    "resolved": true
  },
  {
    "id": "e-59",
    "source": "charge_payment",
    "target": "mask_sensitive_data",
    "kind": "imports",
    "line": 4,
    "resolved": true
  },
  {
    "id": "e-60",
    "source": "charge_payment",
    "target": "Payment",
    "kind": "imports",
    "line": 5,
    "resolved": true
  },
  {
    "id": "e-61",
    "source": "charge_payment",
    "target": "RefundPayment",
    "kind": "imports",
    "line": 5,
    "resolved": true
  },
  {
    "id": "e-62",
    "source": "create_order",
    "target": "Order",
    "kind": "imports",
    "line": 5,
    "resolved": true
  },
  {
    "id": "e-63",
    "source": "create_order",
    "target": "charge_payment",
    "kind": "imports",
    "line": 6,
    "resolved": true
  },
  {
    "id": "e-64",
    "source": "create_order",
    "target": "send_order_confirmation",
    "kind": "imports",
    "line": 7,
    "resolved": true
  },
  {
    "id": "e-65",
    "source": "send_order_confirmation",
    "target": "validate_email",
    "kind": "imports",
    "line": 4,
    "resolved": true
  },
  {
    "id": "e-66",
    "source": "get_current_user",
    "target": "verify_jwt_token",
    "kind": "imports",
    "line": 3,
    "resolved": true
  },
  {
    "id": "e-67",
    "source": "get_current_user",
    "target": "User",
    "kind": "imports",
    "line": 4,
    "resolved": true
  },
  {
    "id": "e-68",
    "source": "place_order",
    "target": "create_order",
    "kind": "imports",
    "line": 4,
    "resolved": true
  },
  {
    "id": "e-69",
    "source": "place_order",
    "target": "get_order_by_id",
    "kind": "imports",
    "line": 4,
    "resolved": true
  },
  {
    "id": "e-70",
    "source": "place_order",
    "target": "Order",
    "kind": "imports",
    "line": 5,
    "resolved": true
  },
  {
    "id": "e-71",
    "source": "initiate_checkout",
    "target": "charge_payment",
    "kind": "imports",
    "line": 4,
    "resolved": true
  },
  {
    "id": "e-72",
    "source": "initiate_checkout",
    "target": "refund_transaction",
    "kind": "imports",
    "line": 4,
    "resolved": true
  },
  {
    "id": "e-73",
    "source": "initiate_checkout",
    "target": "Payment",
    "kind": "imports",
    "line": 5,
    "resolved": true
  },
  {
    "id": "e-74",
    "source": "test_place_order_success",
    "target": "place_order",
    "kind": "imports",
    "line": 2,
    "resolved": true
  },
  {
    "id": "e-75",
    "source": "test_place_order_success",
    "target": "create_order",
    "kind": "imports",
    "line": 3,
    "resolved": true
  },
  {
    "id": "e-76",
    "source": "test_place_order_success",
    "target": "validate_amount",
    "kind": "imports",
    "line": 4,
    "resolved": true
  },
  {
    "id": "e-77",
    "source": "test_charge_payment_flow",
    "target": "charge_payment",
    "kind": "imports",
    "line": 2,
    "resolved": true
  },
  {
    "id": "e-78",
    "source": "test_charge_payment_flow",
    "target": "Payment",
    "kind": "imports",
    "line": 3,
    "resolved": true
  },
  {
    "id": "e-79",
    "source": "test_charge_payment_flow",
    "target": "RefundPayment",
    "kind": "imports",
    "line": 3,
    "resolved": true
  },
  {
    "id": "e-80",
    "source": "User.to_dict",
    "target": "BaseModel.to_dict",
    "kind": "calls",
    "line": 23,
    "resolved": true
  },
  {
    "id": "e-81",
    "source": "Order.to_dict",
    "target": "BaseModel.to_dict",
    "kind": "calls",
    "line": 28,
    "resolved": true
  },
  {
    "id": "e-82",
    "source": "sanitize_input",
    "target": "validate_email",
    "kind": "calls",
    "line": 35,
    "resolved": true
  },
  {
    "id": "e-83",
    "source": "validate_currency",
    "target": "validate_amount",
    "kind": "calls",
    "line": 30,
    "resolved": true
  },
  {
    "id": "e-84",
    "source": "authenticate_user",
    "target": "User.is_active",
    "kind": "calls",
    "line": 20,
    "resolved": false
  },
  {
    "id": "e-85",
    "source": "charge_payment",
    "target": "Payment.process",
    "kind": "calls",
    "line": 22,
    "resolved": false
  },
  {
    "id": "e-86",
    "source": "refund_transaction",
    "target": "RefundPayment.process_refund",
    "kind": "calls",
    "line": 30,
    "resolved": false
  },
  {
    "id": "e-87",
    "source": "send_payment_receipt",
    "target": "get_logger",
    "kind": "calls",
    "line": 18,
    "resolved": false
  },
  {
    "id": "e-88",
    "source": "fetch_order_status",
    "target": "Order.is_cancellable",
    "kind": "calls",
    "line": 27,
    "resolved": false
  },
  {
    "id": "e-89",
    "source": "initiate_checkout",
    "target": "Payment",
    "kind": "calls",
    "line": 16,
    "resolved": false
  },
  {
    "id": "e-90",
    "source": "test_charge_payment_flow",
    "target": "Payment.process",
    "kind": "calls",
    "line": 10,
    "resolved": false
  }
];

export const MOCK_CONNECTED_REPO: ConnectedRepo = {
  id: 'repo-1',
  repo_name: 'my-store',
  full_name: 'acme/my-store',
  branch: 'main',
  status: {
    state: 'ready',
    stage: 'Analysis complete',
    progress: 100,
    files_total: MOCK_FILES.filter(f => f.analyzed).length,
    files_done: MOCK_FILES.filter(f => f.analyzed).length,
    error: null,
    updated_at: '2026-10-22T10:00:00Z',
  },
  file_count: MOCK_FILES.length,
  symbol_count: MOCK_SYMBOLS.length,
  edge_count: MOCK_EDGES.length,
  language: 'Python',
  updated_at: '2026-10-22T10:00:00Z',
};

// -------------------------------------------------------------
// HELPER FUNCTIONS (computed ONLY from that data)
// -------------------------------------------------------------

/**
 * Derives repository statistics directly from data arrays.
 */
export function getStats(): RepoStats {
  const languages = Array.from(new Set(MOCK_FILES.map(f => f.language)));
  return {
    files_count: MOCK_FILES.length,
    symbols_count: MOCK_SYMBOLS.length,
    edges_count: MOCK_EDGES.length,
    unresolved_edges_count: MOCK_EDGES.filter(e => !e.resolved).length,
    languages,
  };
}

/**
 * Returns aggregated file dependency graph with counts.
 */
export function getFileGraph(): GraphData {
  const fileNodesMap = new Map<string, GraphNode>();

  for (const file of MOCK_FILES.filter(f => f.analyzed)) {
    const fileSymbols = MOCK_SYMBOLS.filter(s => s.file === file.path);
    fileNodesMap.set(file.path, {
      id: file.path,
      label: file.path.split('/').pop() || file.path,
      kind: 'file',
      file: file.path,
      metrics: {
        symbol_count: fileSymbols.length,
        in_degree: 0,
        out_degree: 0,
      },
    });
  }

  const symbolToFile = new Map<string, string>();
  for (const s of MOCK_SYMBOLS) {
    symbolToFile.set(s.id, s.file);
  }

  const fileEdgesMap = new Map<string, GraphEdge>();

  for (const edge of MOCK_EDGES) {
    const srcFile = symbolToFile.get(edge.source);
    const tgtFile = symbolToFile.get(edge.target);
    if (!srcFile || !tgtFile || srcFile === tgtFile) continue;

    const key = `${srcFile}->${tgtFile}`;
    const existing = fileEdgesMap.get(key);
    if (existing) {
      existing.count = (existing.count || 1) + 1;
    } else {
      fileEdgesMap.set(key, {
        id: `fe-${key}`,
        source: srcFile,
        target: tgtFile,
        kind: edge.kind,
        line: edge.line,
        resolved: edge.resolved,
        count: 1,
      });

      const srcNode = fileNodesMap.get(srcFile);
      if (srcNode?.metrics) {
        srcNode.metrics.out_degree = (srcNode.metrics.out_degree || 0) + 1;
      }
      const tgtNode = fileNodesMap.get(tgtFile);
      if (tgtNode?.metrics) {
        tgtNode.metrics.in_degree = (tgtNode.metrics.in_degree || 0) + 1;
      }
    }
  }

  return {
    nodes: Array.from(fileNodesMap.values()),
    edges: Array.from(fileEdgesMap.values()),
  };
}

/**
 * Returns the symbol dependency graph.
 */
export function getSymbolGraph(): GraphData {
  return {
    nodes: MOCK_SYMBOLS,
    edges: MOCK_EDGES,
  };
}

/**
 * Returns the neighborhood subgraph around target IDs within hops distance.
 */
export function getNeighborhood(
  ids: string[],
  hops: number = 1,
  direction: 'in' | 'out' | 'both' = 'both'
): GraphData {
  const visitedNodes = new Set<string>(ids);
  let frontier = new Set<string>(ids);

  for (let h = 0; h < hops; h++) {
    const nextFrontier = new Set<string>();
    for (const currentId of frontier) {
      for (const edge of MOCK_EDGES) {
        if (
          (direction === 'out' || direction === 'both') &&
          edge.source === currentId &&
          !visitedNodes.has(edge.target)
        ) {
          visitedNodes.add(edge.target);
          nextFrontier.add(edge.target);
        }
        if (
          (direction === 'in' || direction === 'both') &&
          edge.target === currentId &&
          !visitedNodes.has(edge.source)
        ) {
          visitedNodes.add(edge.source);
          nextFrontier.add(edge.source);
        }
      }
    }
    frontier = nextFrontier;
    if (frontier.size === 0) break;
  }

  const nodes = MOCK_SYMBOLS.filter(s => visitedNodes.has(s.id));
  const edges = MOCK_EDGES.filter(
    e => visitedNodes.has(e.source) && visitedNodes.has(e.target)
  );

  return { nodes, edges };
}

/**
 * Performs impact analysis for targetIds.
 * Rule: NEVER includes a target in its own results and de-duplicates by shortest distance.
 */
export function getImpact(targetIds: string[], depth: number = 3): ImpactResult {
  const targetSet = new Set<string>(targetIds);
  // Map of impacted node ID -> { distance, path }
  const shortest = new Map<string, { distance: number; path: string[] }>();

  // Queue: [nodeId, currentDistance, pathSoFar]
  // We traverse incoming edges (callers/dependents that call or rely on this target)
  const queue: Array<{ nodeId: string; distance: number; path: string[] }> = [];

  for (const tid of targetIds) {
    queue.push({ nodeId: tid, distance: 0, path: [tid] });
  }

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.distance >= depth) continue;

    const nextDist = item.distance + 1;

    // Find all edges pointing TO item.nodeId (incoming callers/dependents)
    for (const edge of MOCK_EDGES) {
      if (edge.target === item.nodeId) {
        const dependentId = edge.source;

        // CRITICAL RULE: NEVER include target in its own results
        if (targetSet.has(dependentId)) {
          continue;
        }

        const existing = shortest.get(dependentId);
        if (!existing || nextDist < existing.distance) {
          const newPath = [...item.path, dependentId];
          shortest.set(dependentId, { distance: nextDist, path: newPath });
          queue.push({ nodeId: dependentId, distance: nextDist, path: newPath });
        }
      }
    }
  }

  const impacted_nodes: ImpactedNode[] = [];
  for (const [nodeId, info] of shortest.entries()) {
    const risk = info.distance === 1 ? 'high' : info.distance === 2 ? 'medium' : 'low';
    impacted_nodes.push({
      node_id: nodeId,
      distance: info.distance,
      path: info.path,
      risk,
      direct: info.distance === 1,
    });
  }

  // Sort by shortest distance ascending
  impacted_nodes.sort((a, b) => a.distance - b.distance);

  return {
    target_ids: targetIds,
    impacted_nodes,
    total_impacted: impacted_nodes.length,
    max_depth: depth,
  };
}

/**
 * Finds all simple directed paths between two symbols up to maxDepth.
 */
export function findPaths(
  sourceId: string,
  targetId: string,
  maxDepth: number = 6
): string[][] {
  const results: string[][] = [];

  function dfs(current: string, path: string[], visited: Set<string>) {
    if (path.length > maxDepth) return;
    if (current === targetId) {
      results.push([...path]);
      return;
    }

    for (const edge of MOCK_EDGES) {
      if (edge.source === current && !visited.has(edge.target)) {
        visited.add(edge.target);
        dfs(edge.target, [...path, edge.target], visited);
        visited.delete(edge.target);
      }
    }
  }

  const visited = new Set<string>([sourceId]);
  dfs(sourceId, [sourceId], visited);
  return results;
}

/**
 * Search across symbols, files, and code content.
 */
export function search(query: string): SearchResult {
  const q = query.trim().toLowerCase();
  if (!q) {
    return { query, matches: [], total: 0 };
  }

  const matches: SearchMatch[] = [];

  // Match symbols
  for (const sym of MOCK_SYMBOLS) {
    if (
      sym.label.toLowerCase().includes(q) ||
      sym.description?.toLowerCase().includes(q) ||
      sym.kind.toLowerCase() === q
    ) {
      matches.push({
        id: `sym-${sym.id}`,
        type: 'symbol',
        name: sym.label,
        file_path: sym.file,
        line: sym.start_line,
        match_snippet: sym.description,
        score: sym.label.toLowerCase() === q ? 1.0 : 0.8,
      });
    }
  }

  // Match files
  for (const file of MOCK_FILES) {
    if (file.path.toLowerCase().includes(q)) {
      matches.push({
        id: `file-${file.path}`,
        type: 'file',
        name: file.path.split('/').pop() || file.path,
        file_path: file.path,
        score: file.path.toLowerCase().endsWith(q) ? 0.9 : 0.7,
      });
    }
  }

  // Match code snippets (limit to top matches)
  for (const file of MOCK_FILES) {
    const lines = file.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        matches.push({
          id: `code-${file.path}:${i + 1}`,
          type: 'code',
          name: `Line ${i + 1}`,
          file_path: file.path,
          line: i + 1,
          match_snippet: lines[i].trim(),
          score: 0.6,
        });
        if (matches.length >= 30) break;
      }
    }
    if (matches.length >= 30) break;
  }

  matches.sort((a, b) => b.score - a.score);

  return {
    query,
    matches,
    total: matches.length,
  };
}

/**
 * Constructs hierarchical TreeNode from file list.
 */
export function getFileTree(): TreeNode {
  const root: TreeNode = {
    id: 'root',
    name: 'acme/my-store',
    path: '',
    type: 'directory',
    children: [],
  };

  for (const file of MOCK_FILES) {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const curPath = parts.slice(0, i + 1).join('/');

      if (!current.children) current.children = [];

      let child = current.children.find(c => c.name === part);
      if (!child) {
        child = {
          id: curPath,
          name: part,
          path: curPath,
          type: isFile ? 'file' : 'directory',
          language: isFile ? file.language : undefined,
          analyzed: isFile ? file.analyzed : undefined,
          children: isFile ? undefined : [],
        };
        current.children.push(child);
      }
      current = child;
    }
  }

  return root;
}

/**
 * Retrieves file content and metadata by path.
 */
export function getFile(path: string): FileContent | null {
  return MOCK_FILES.find(f => f.path === path) || null;
}

/**
 * Retrieves detailed relational metadata for a specific symbol or file node.
 */
export function getNodeDetail(id: string): NodeDetail | null {
  const node = MOCK_SYMBOLS.find(s => s.id === id);
  if (!node) return null;

  const symbolMap = new Map<string, GraphNode>();
  for (const s of MOCK_SYMBOLS) symbolMap.set(s.id, s);

  const callers: GraphNode[] = [];
  const callees: GraphNode[] = [];
  const imports: GraphNode[] = [];
  const imported_by: GraphNode[] = [];
  const inherits: GraphNode[] = [];
  const inherited_by: GraphNode[] = [];

  for (const edge of MOCK_EDGES) {
    if (edge.kind === 'calls') {
      if (edge.target === id && symbolMap.has(edge.source)) {
        callers.push(symbolMap.get(edge.source)!);
      }
      if (edge.source === id && symbolMap.has(edge.target)) {
        callees.push(symbolMap.get(edge.target)!);
      }
    } else if (edge.kind === 'imports') {
      if (edge.target === id && symbolMap.has(edge.source)) {
        imported_by.push(symbolMap.get(edge.source)!);
      }
      if (edge.source === id && symbolMap.has(edge.target)) {
        imports.push(symbolMap.get(edge.target)!);
      }
    } else if (edge.kind === 'inherits') {
      if (edge.target === id && symbolMap.has(edge.source)) {
        inherited_by.push(symbolMap.get(edge.source)!);
      }
      if (edge.source === id && symbolMap.has(edge.target)) {
        inherits.push(symbolMap.get(edge.target)!);
      }
    }
  }

  // Extract source snippet
  const file = MOCK_FILES.find(f => f.path === node.file);
  let snippet: string | undefined;
  if (file && node.start_line && node.end_line) {
    const lines = file.content.split('\n');
    snippet = lines.slice(node.start_line - 1, node.end_line).join('\n');
  }

  return {
    node,
    callers,
    callees,
    imports,
    imported_by,
    inherits,
    inherited_by,
    source_snippet: snippet,
  };
}

/**
 * Computes connectivity and paths between two symbols.
 */
export function getConnection(sourceId: string, targetId: string): ConnectionResult {
  const paths = findPaths(sourceId, targetId);
  const pathEdgeSet = new Set<string>();

  for (const p of paths) {
    for (let i = 0; i < p.length - 1; i++) {
      pathEdgeSet.add(`${p[i]}->${p[i + 1]}`);
    }
  }

  const edges = MOCK_EDGES.filter(e => pathEdgeSet.has(`${e.source}->${e.target}`));

  return {
    source: sourceId,
    target: targetId,
    connected: paths.length > 0,
    paths,
    edges,
  };
}

/**
 * Simulates AI codebase Q&A with citations.
 */
export function ask(question: string): AskResult {
  const querySummary = question.trim() ? ` regarding "${question.trim()}"` : '';
  const citations: Citation[] = [
    {
      id: 'cit-1',
      file_path: 'src/api/orders.py',
      start_line: 8,
      end_line: 18,
      symbol: 'place_order',
      snippet: 'def place_order(payload: Dict[str, Any]) -> Dict[str, Any]:\\n    order = create_order(...)',
      sources: ['AST Call Graph', 'Source Parser'],
    },
    {
      id: 'cit-2',
      file_path: 'src/services/payment_service.py',
      start_line: 14,
      end_line: 23,
      symbol: 'charge_payment',
      snippet: 'def charge_payment(order_id: str, amount: float, ...):\\n    validate_amount(amount)',
      sources: ['Symbol Graph'],
    },
  ];

  return {
    answer: `AI-generated: The checkout workflow${querySummary} begins in place_order (src/api/orders.py), delegates to create_order (src/services/order_service.py), and settles transactions through charge_payment (src/services/payment_service.py) while validating amounts via validate_amount.`,
    verified: true,
    citations,
    latency_ms: 480,
  };
}
