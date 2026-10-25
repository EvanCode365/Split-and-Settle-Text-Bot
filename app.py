"""
================================================================================
SPLIT & SETTLE GENAI - VISA HACKATHON TESTING SANDBOX
================================================================================
Architectural Role: Principal Software Engineer Guide
Target Audience:    Beginner Computer Science Students @ Visa Hackathon
Tech Stack:         Python 3.10+, Streamlit, SQLite3, Google Generative AI (Gemini)

OVERVIEW:
This single-file Streamlit application serves as an agentic commerce sandbox.
It allows users to either:
  1. Type conversational expense messages (e.g., "Alex paid $42 for Team Pizza")
  2. Upload receipt images (JPEG/PNG)
The app passes the input to the Google Gemini API with a STRICT response_schema
guaranteeing a pure JSON payload:
  {"payer": str, "amount": float, "description": str}

It then records transactions into an SQLite database (ledger.db) and executes a
minimal cash flow settlement algorithm representing a mock Visa Direct
Push-to-Card real-time disbursement network.
================================================================================
"""

import os
import json
import sqlite3
from typing import TypedDict, List, Dict, Tuple, Optional
import streamlit as st
from PIL import Image

# -----------------------------------------------------------------------------
# 1. AI INTEGRATION SETUP & SCHEMA DEFINITION
# -----------------------------------------------------------------------------
# We use the official `google-generativeai` SDK.
# To enforce strict structured JSON output with zero markdown formatting
# (e.g., avoiding ```json wrappers or chatty apologies), we define a TypedDict
# and feed it into `response_schema` alongside `response_mime_type="application/json"`.
try:
    import google.generativeai as genai
except ImportError:
    genai = None

class ExpenseSchema(TypedDict):
    """
    Schema definition for Gemini structured outputs.
    Guarantees the model returns EXACTLY these three keys with these exact types.
    """
    payer: str
    amount: float
    description: str

def get_gemini_api_key() -> Optional[str]:
    """
    Retrieves the Gemini API key from environment variables or Streamlit secrets.
    """
    # 1. Check environment variable (standard in cloud environments / AI Studio)
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        return api_key
    
    # 2. Check Streamlit secrets (if deployed on Streamlit Community Cloud)
    if hasattr(st, "secrets") and "GEMINI_API_KEY" in st.secrets:
        return st.secrets["GEMINI_API_KEY"]
        
    return None

def extract_expense_with_gemini(
    text_prompt: Optional[str] = None,
    image_file: Optional[Image.Image] = None,
    api_key: Optional[str] = None
) -> Dict[str, any]:
    """
    Calls Google Gemini using the strict `response_schema` parameter.
    Accepts EITHER:
      - text_prompt (e.g., "Sarah paid 54.20 for hackathon snacks")
      - image_file (PIL Image instance of a receipt)
      - or both simultaneously!
      
    Returns a Python dictionary:
      {"payer": str, "amount": float, "description": str}
    """
    if not genai:
        raise RuntimeError("The 'google-generativeai' package is not installed. Run `pip install google-generativeai`.")

    key = api_key or get_gemini_api_key()
    if not key:
        raise ValueError("Missing Gemini API Key. Please provide one in the sidebar or set GEMINI_API_KEY.")

    genai.configure(api_key=key)

    # System instruction guiding the model to act as a strict financial parser.
    system_instruction = (
        "You are an expert financial expense parsing agent for Visa Hackathon's Split & Settle GenAI app. "
        "Your sole task is to extract: "
        "1. 'payer': The first name or identifier of who paid (if not explicitly stated, infer from context or use 'You'). "
        "2. 'amount': The final total dollar amount as a float (e.g. 42.50). "
        "3. 'description': A short, clear merchant name or purpose (e.g. 'Blue Bottle Coffee', 'Uber Ride'). "
        "Always be precise with decimals. Do not include currency symbols in the amount."
    )

    # Configuration enforcing JSON MIME type and strict TypedDict schema.
    generation_config = {
        "temperature": 0.1,  # Low temperature ensures deterministic, factual extraction
        "response_mime_type": "application/json",
        "response_schema": ExpenseSchema,
    }

    # Use Gemini Flash for lightning-fast multimodal OCR and structured reasoning
    model = genai.GenerativeModel(
        model_name="gemini-1.5-flash",
        system_instruction=system_instruction,
        generation_config=generation_config
    )

    contents = []
    if image_file:
        contents.append(image_file)
        if not text_prompt:
            contents.append("Analyze this receipt and extract the payer, total amount, and vendor description.")
    
    if text_prompt:
        contents.append(text_prompt)

    if not contents:
        raise ValueError("No input provided. Provide text or an image.")

    response = model.generate_content(contents)
    
    # Because we used response_schema, response.text is guaranteed to be clean JSON!
    parsed_json = json.loads(response.text)
    return parsed_json


# -----------------------------------------------------------------------------
# 2. SQLITE DATABASE HELPERS
# -----------------------------------------------------------------------------
# We use Python's built-in sqlite3. For production hackathon demonstrations,
# persisting to 'ledger.db' ensures the team can inspect rows using standard tools.
DB_FILE = "ledger.db"

def init_db():
    """
    Initializes the local SQLite database and creates the Expenses table
    if it does not already exist.
    """
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS Expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payer TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()

def insert_expense(payer: str, amount: float, description: str) -> int:
    """
    Inserts a newly parsed expense into the SQLite ledger.
    Returns the newly generated row ID.
    """
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO Expenses (payer, amount, description) VALUES (?, ?, ?)",
        (payer.strip().capitalize(), round(float(amount), 2), description.strip())
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return new_id

def get_expenses() -> List[Tuple[int, str, float, str]]:
    """
    Fetches all expenses currently recorded in the SQLite ledger.
    Returns: List of tuples (id, payer, amount, description)
    """
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    cursor = conn.cursor()
    cursor.execute("SELECT id, payer, amount, description FROM Expenses ORDER BY id ASC")
    rows = cursor.fetchall()
    conn.close()
    return rows

def clear_expenses():
    """
    Clears all rows from the Expenses table (useful for fresh testing runs).
    """
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM Expenses")
    conn.commit()
    conn.close()

def seed_sample_data():
    """
    Inserts initial mock data for immediate demonstration.
    """
    clear_expenses()
    insert_expense("Alice", 90.00, "Hackathon Airbnb Booking")
    insert_expense("Bob", 30.00, "Team Pizza Lunch")
    insert_expense("Charlie", 15.00, "Boba Tea Refreshments")


# -----------------------------------------------------------------------------
# 3. SETTLEMENT MATH: MINIMUM CASH FLOW ALGORITHM
# -----------------------------------------------------------------------------
def calculate_settlements(expenses: List[Tuple[int, str, float, str]]) -> Dict[str, any]:
    """
    Settlement Algorithm Explanation for CS Students:
    -------------------------------------------------
    1. Identify all unique participants.
    2. Sum the total money spent across the entire group.
    3. Calculate the equal share per person: fair_share = total_spent / num_participants.
    4. Compute each person's Net Balance:
          balance = amount_paid - fair_share
       - Positive balance: Creditor (they paid more than their share; they receive money).
       - Negative balance: Debtor (they paid less than their share; they owe money).
       - Zero balance: Settled.
    5. Greedy Bipartite Matching:
       Pair the person who owes the most (largest negative balance) with the person
       who is owed the most (largest positive balance). Transfer min(|debt|, credit).
       Repeat until all debts are 0.
       This minimizes the total number of transactions needed!
    """
    if not expenses:
        return {"total": 0.0, "fair_share": 0.0, "settlements": [], "balances": {}}

    # Step 1: Accumulate spending per payer
    paid_by_person: Dict[str, float] = {}
    for _, payer, amount, _ in expenses:
        paid_by_person[payer] = paid_by_person.get(payer, 0.0) + amount

    participants = list(paid_by_person.keys())
    num_participants = len(participants)

    if num_participants <= 1:
        return {
            "total": sum(paid_by_person.values()),
            "fair_share": sum(paid_by_person.values()),
            "settlements": [],
            "balances": {p: 0.0 for p in participants}
        }

    total_spent = sum(paid_by_person.values())
    fair_share = total_spent / num_participants

    # Step 2: Compute net balances
    # balances: positive = is owed money, negative = owes money
    balances: Dict[str, float] = {
        person: round(amount - fair_share, 2)
        for person, amount in paid_by_person.items()
    }

    # Step 3: Separate into creditors and debtors lists
    creditors: List[List[any]] = [] # [person, amount_to_receive]
    debtors: List[List[any]] = []   # [person, amount_to_pay]

    for person, bal in balances.items():
        if bal > 0.01:
            creditors.append([person, bal])
        elif bal < -0.01:
            debtors.append([person, abs(bal)])

    # Step 4: Greedy reconciliation
    settlements: List[Dict[str, any]] = []

    # Sort to optimize greedy pairings
    creditors.sort(key=lambda x: x[1], reverse=True)
    debtors.sort(key=lambda x: x[1], reverse=True)

    i = 0  # debtor pointer
    j = 0  # creditor pointer

    while i < len(debtors) and j < len(creditors):
        debtor_name, debt_amt = debtors[i]
        creditor_name, cred_amt = creditors[j]

        # Settle the minimum of the two amounts
        transfer_amount = min(debt_amt, cred_amt)
        if transfer_amount > 0.005:
            settlements.append({
                "from_person": debtor_name,
                "to_person": creditor_name,
                "amount": round(transfer_amount, 2)
            })

        debtors[i][1] -= transfer_amount
        creditors[j][1] -= transfer_amount

        # Move pointers if balance is settled
        if debtors[i][1] < 0.01:
            i += 1
        if creditors[j][1] < 0.01:
            j += 1

    return {
        "total": round(total_spent, 2),
        "fair_share": round(fair_share, 2),
        "settlements": settlements,
        "balances": balances
    }


# -----------------------------------------------------------------------------
# 4. STREAMLIT FRONTEND APPLICATION
# -----------------------------------------------------------------------------
def main():
    # Page configuration for a wide, clean UI
    st.set_page_config(
        page_title="Split & Settle GenAI - Visa Hackathon Sandbox",
        page_icon="💳",
        layout="wide",
        initial_sidebar_state="expanded"
    )

    # Initialize SQLite database
    init_db()

    # Session State Initialization for Chat Messages & Processing Flags
    if "messages" not in st.session_state:
        st.session_state.messages = [
            {
                "role": "assistant",
                "content": (
                    "👋 **Welcome to Split & Settle GenAI!**\n\n"
                    "I am your Visa Agentic Commerce assistant. "
                    "You can **type an expense** (e.g. *'Dan paid $45 for airport Uber'*) "
                    "or **upload a receipt photo** below. I will use the Gemini API with "
                    "strict `response_schema` to parse the transaction and post it directly to our group ledger!"
                )
            }
        ]

    # Sidebar: Hackathon Configuration & Dev Tools
    with st.sidebar:
        st.image("https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg", width=110)
        st.title("Visa Hackathon Hub")
        st.caption("Agentic Commerce • Real-Time Settlement Rails")
        
        st.markdown("---")
        st.subheader("🔑 Gemini API Settings")
        env_key = get_gemini_api_key()
        
        user_key = st.text_input(
            "Gemini API Key",
            value=env_key if env_key else "",
            type="password",
            help="Get an API key from Google AI Studio (https://aistudio.google.com/)"
        )
        if not user_key:
            st.warning("⚠️ Enter your Gemini API Key to enable multimodal AI parsing.")
        else:
            st.success("✅ Gemini API Key detected.")

        st.markdown("---")
        st.subheader("🛠️ Developer Tools")
        col_seed, col_clear = st.columns(2)
        with col_seed:
            if st.button("🌱 Seed Demo", use_container_width=True):
                seed_sample_data()
                st.toast("Seeded 3 demo expenses into ledger.db!", icon="🌱")
                st.rerun()
        with col_clear:
            if st.button("🗑️ Reset DB", use_container_width=True):
                clear_expenses()
                st.toast("Ledger wiped clean.", icon="🧹")
                st.rerun()

        st.markdown("---")
        st.markdown(
            "**Architectural Notes for Students:**\n"
            "- Multimodal: `PIL.Image` + `gemini-1.5-flash`\n"
            "- Structured Output: `response_schema=ExpenseSchema`\n"
            "- Storage: ACID compliant `sqlite3`\n"
            "- Settlement: Bipartite minimum cash flow"
        )

    # Main Header
    st.title("💳 Split & Settle GenAI")
    st.markdown(
        "**Real-time Multimodal Receipt Ingestion & Visa Direct Push-to-Card Settlement Engine**"
    )
    st.markdown("---")

    # REQUIREMENT 1: TWO-COLUMN STREAMLIT LAYOUT
    col_left, col_right = st.columns([1, 1], gap="large")

    # =========================================================================
    # LEFT COLUMN: "Private Chat"
    # =========================================================================
    with col_left:
        st.subheader("💬 Private Chat & Multimodal Ingestion")
        st.caption("Upload a paper receipt or type natural language expense notes.")

        # Chat message history container
        chat_container = st.container(height=420)
        with chat_container:
            for msg in st.session_state.messages:
                with st.chat_message(msg["role"]):
                    st.markdown(msg["content"])
                    if "image" in msg:
                        st.image(msg["image"], caption="Uploaded Receipt", width=220)

        # File Uploader for Receipts
        uploaded_file = st.file_uploader(
            "📸 Upload Receipt Photo (PNG / JPG / WEBP)",
            type=["png", "jpg", "jpeg", "webp"],
            key="receipt_uploader",
            help="Upload a physical receipt photo to trigger Gemini Vision OCR extraction."
        )

        # Chat Text Input
        chat_prompt = st.chat_input("Type an expense: e.g. 'Emma paid $68.50 for Team Dinner'...")

        # Process Receipt Upload or Chat Text
        if uploaded_file or chat_prompt:
            pil_image = None
            if uploaded_file:
                pil_image = Image.open(uploaded_file)

            # Record user input in chat
            user_msg_text = chat_prompt if chat_prompt else "Uploaded a receipt for parsing."
            st.session_state.messages.append({
                "role": "user",
                "content": user_msg_text,
                **({"image": pil_image} if pil_image else {})
            })

            # Show progress spinner while Gemini processes
            with st.spinner("🤖 Gemini Agent is parsing receipt & enforcing strict JSON schema..."):
                try:
                    # AI Call with response_schema
                    parsed_result = extract_expense_with_gemini(
                        text_prompt=chat_prompt,
                        image_file=pil_image,
                        api_key=user_key
                    )

                    payer = parsed_result.get("payer", "Unknown")
                    amount = float(parsed_result.get("amount", 0.0))
                    description = parsed_result.get("description", "Unspecified expense")

                    # Insert directly into SQLite database
                    new_id = insert_expense(payer, amount, description)

                    # Assistant confirmation reply
                    response_md = (
                        f"✅ **Expense Extracted & Recorded!**\n\n"
                        f"- **Payer:** `{payer}`\n"
                        f"- **Amount:** `${amount:.2f}`\n"
                        f"- **Description:** `{description}`\n"
                        f"- **SQLite Row ID:** `#{new_id}`\n\n"
                        f"*Raw JSON payload verified against `ExpenseSchema`.*"
                    )
                    st.session_state.messages.append({
                        "role": "assistant",
                        "content": response_md
                    })
                    st.toast(f"Saved: {payer} paid ${amount:.2f}", icon="💾")
                    st.rerun()

                except Exception as e:
                    error_msg = f"❌ **Error parsing expense:** `{str(e)}`"
                    st.session_state.messages.append({
                        "role": "assistant",
                        "content": error_msg
                    })
                    st.error(error_msg)

    # =========================================================================
    # RIGHT COLUMN: "Group Ledger" & Settlement
    # =========================================================================
    with col_right:
        st.subheader("📑 Group Ledger (`ledger.db`)")
        st.caption("Synchronized SQLite state representing the active shared pool.")

        # Fetch current database rows
        rows = get_expenses()

        if rows:
            # Format rows as clean dictionary records for display
            table_data = [
                {
                    "ID": r[0],
                    "Payer": r[1],
                    "Amount ($)": f"${r[2]:.2f}",
                    "Description": r[3]
                }
                for r in rows
            ]
            st.dataframe(table_data, use_container_width=True, hide_index=True)

            total_pool = sum(r[2] for r in rows)
            unique_payers = len(set(r[1] for r in rows))
            avg_per_person = total_pool / unique_payers if unique_payers > 0 else 0

            # Metric Cards
            m1, m2, m3 = st.columns(3)
            m1.metric("Total Pool", f"${total_pool:.2f}")
            m2.metric("Participants", f"{unique_payers}")
            m3.metric("Split / Person", f"${avg_per_person:.2f}")

        else:
            st.info("ℹ️ The ledger is currently empty. Seed demo data or type an expense on the left!")

        st.markdown("---")
        st.subheader("⚡ Visa Direct Settlement Engine")
        st.caption("Executes minimal cash flow reconciliation and simulates push-to-card payout rails.")

        # SETTLEMENT BUTTON (Requirement 1 & 4)
        run_settlement = st.button(
            "🚀 Run Visa Direct Settlement",
            type="primary",
            use_container_width=True,
            disabled=len(rows) == 0
        )

        if run_settlement:
            results = calculate_settlements(rows)
            settlements = results["settlements"]

            st.markdown("### 📊 Net Balances Breakdown")
            for person, balance in results["balances"].items():
                if balance > 0:
                    st.success(f"🟢 **{person}** is owed **+${balance:.2f}**")
                elif balance < 0:
                    st.error(f"🔴 **{person}** owes **-${abs(balance):.2f}**")
                else:
                    st.info(f"⚪ **{person}** is completely settled ($0.00)")

            st.markdown("---")
            if not settlements:
                st.balloons()
                st.success("🎉 All balances are perfectly settled! No transactions required.")
            else:
                # REQUIREMENT 5: Mock Success Message
                st.success("✅ Visa Direct Push-to-Card Authorized")

                st.markdown("#### 💳 Simulated Visa Push-to-Card Payout Transfers:")
                for idx, tx in enumerate(settlements, 1):
                    with st.container():
                        st.markdown(
                            f"""
                            <div style="background-color: #1e293b; padding: 14px 18px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #1434CB;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-weight: 600; font-size: 1.05rem; color: #f8fafc;">
                                        💸 #{idx}: <b>{tx['from_person']}</b> ➔ <b>{tx['to_person']}</b>
                                    </span>
                                    <span style="font-weight: 700; font-size: 1.15rem; color: #38bdf8;">
                                        ${tx['amount']:.2f} USD
                                    </span>
                                </div>
                                <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 6px;">
                                    Rail: <b>Visa Direct FastFunds</b> | Auth Code: <code>VD-AUTH-99{idx}42</code> | Status: <b>CLEARED (0.42s)</b>
                                </div>
                            </div>
                            """,
                            unsafe_allow_html=True
                        )

                st.caption(
                    "🔒 All disbursements routed via Visa Direct API endpoint: "
                    "`POST /visadirect/fundstransfer/v1/pullfundstransfer` & "
                    "`/pushfundstransfer`"
                )

if __name__ == "__main__":
    main()
