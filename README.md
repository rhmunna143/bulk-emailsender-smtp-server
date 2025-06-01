# Bulk Email Sender

This project is a simple Express.js application that allows you to send bulk emails using Nodemailer. It is designed to handle sending personalized emails to multiple recipients at once.

## Features

- Send bulk emails (100-200 at once)
- Personalized email content for each recipient
- SMTP configuration using environment variables
- Basic error handling and response reporting

## Prerequisites

- Node.js installed on your machine
- An SMTP server (e.g., Gmail, Mailgun, or custom SMTP)

## Setup Instructions

1. **Clone the repository:**

   ```bash
   git clone <repository-url>
   cd bulk-email-sender
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Create a `.env` file:**

   Create a `.env` file in the root directory and add your SMTP configuration:

   ```
   SMTP_HOST=your_smtp_host
   SMTP_PORT=your_smtp_port
   SMTP_USER=your_smtp_user
   SMTP_PASS=your_smtp_password
   ```

4. **Run the application:**

   ```bash
   node index.js
   ```

5. **Send a POST request to `/send-emails`:**

   Use a tool like Postman or cURL to send a request with the following JSON payload:

   ```json
   {
     "senderName": "Your Name",
     "subject": "Email Subject",
     "message": "Hello, this is the email content",
     "recipients": ["email1@example.com", "email2@example.com"]
   }
   ```

## Response Format

After sending the emails, the server will respond with a JSON object indicating the success of the operation:

```json
{
  "success": true,
  "sent": 198,
  "failed": 2,
  "details": [...]
}
```

## License

This project is licensed under the MIT License.