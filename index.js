const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const net = require('net');
const fs = require('fs').promises;
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory email storage (for development)
const emailStore = [];

// Rate limiting
const limiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 1000,
  message: 'Too many requests from this IP, please try again later'
});
app.use('/send-emails', limiter);

// Update the SimpleSmtp class to use your Hostinger credentials
class SimpleSmtp {
  constructor(options = {}) {
    this.options = {
      debug: options.debug || false,
      localMode: options.localMode || false,
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    };
  }

  async sendMail(mailOptions) {
    if (this.options.debug) {
      console.log('Mail options:', mailOptions);
    }

    if (this.options.localMode) {
      // Store email locally instead of sending
      const email = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        from: mailOptions.from,
        to: mailOptions.to,
        subject: mailOptions.subject,
        text: mailOptions.text,
        html: mailOptions.html,
        status: 'sent (local)'
      };
      emailStore.push(email);
      return { messageId: email.id };
    } else {
      // Use Hostinger SMTP
      try {
        return await this._sendViaHostinger(mailOptions);
      } catch (error) {
        console.error('SMTP Error:', error);
        throw error;
      }
    }
  }

  async _sendViaHostinger(mailOptions) {
    const tls = require('tls');
    
    return new Promise((resolve, reject) => {
      const socket = tls.connect({
        host: this.options.host,
        port: this.options.port,
        timeout: this.options.timeout || 10000
      });
      
      socket.setTimeout(this.options.timeout || 10000);
      
      let stage = 0;
      const messageId = `<${Date.now()}@${mailOptions.from.split('@')[1]}>`;
      const sender = this.options.auth.user;
      const recipient = mailOptions.to;
      
      // Update the commands in _sendViaHostinger method
      const commands = [
        `EHLO ${sender.split('@')[1]}\r\n`,
        `AUTH LOGIN\r\n`,
        `${Buffer.from(this.options.auth.user).toString('base64')}\r\n`,
        `${Buffer.from(this.options.auth.pass).toString('base64')}\r\n`,
        `MAIL FROM:<${sender}>\r\n`,
        `RCPT TO:<${recipient}>\r\n`,
        `DATA\r\n`,
        `From: ${mailOptions.from}\r\nTo: ${recipient}\r\nSubject: ${mailOptions.subject}\r\nMessage-ID: ${messageId}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${mailOptions.html || mailOptions.text}\r\n.\r\n`,
        `QUIT\r\n`
      ];

      // Add more debugging
      socket.on('data', (data) => {
        const response = data.toString();
        if (this.options.debug) {
          console.log(`SMTP Response: ${response}`);
          if (stage === 2) console.log(`Sending username: ${this.options.auth.user}`);
          if (stage === 3) console.log(`Sending password: [HIDDEN]`);
        }
        
        if ((response.startsWith('2') || response.startsWith('3') || response.startsWith('334'))) {
          if (stage < commands.length) {
            socket.write(commands[stage++]);
          }
        } else {
          socket.end();
          reject(new Error(`SMTP Error: ${response}`));
        }
      });

      socket.on('timeout', () => {
        socket.end();
        reject(new Error('SMTP connection timeout'));
      });

      socket.on('error', (err) => {
        reject(err);
      });

      socket.on('close', () => {
        if (stage >= commands.length-1) {
          resolve({ messageId });
        } else {
          reject(new Error('SMTP connection closed prematurely'));
        }
      });
    });
  }

  verify() {
    // Always returns success in local mode
    return Promise.resolve(true);
  }
}

// Validate email input
const validateEmailRequest = (req, res, next) => {
  const { senderName, subject, message, recipients } = req.body;
  
  if (!senderName || !subject || !message || !recipients) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields'
    });
  }
  
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Recipients must be a non-empty array'
    });
  }
  
  next();
};

// Send email function
const sendEmail = async (transporter, senderName, recipient, subject, message) => {
  try {
    await transporter.sendMail({
      from: `"${senderName}" <${process.env.SMTP_USER}>`,  // Use your actual email
      to: recipient,
      subject: subject,
      text: message,
      html: message.replace(/\n/g, '<br>')
    });
    return { recipient, status: 'sent' };
  } catch (error) {
    return { recipient, status: 'failed', error: error.message };
  }
};

// Email sending route
app.post('/send-emails', validateEmailRequest, async (req, res) => {
  const { senderName, subject, message, recipients } = req.body;
  let sentCount = 0;
  let failedCount = 0;
  const details = [];

  try {
    // Create SMTP transporter with Hostinger credentials
    const transporter = new SimpleSmtp({
      debug: true, 
      localMode: false  // Set to false to use actual SMTP
    });
    
    // No verification needed in local mode
    
    const emailPromises = recipients.map(async (recipient) => {
      const result = await sendEmail(transporter, senderName, recipient, subject, message);
      if (result.status === 'sent') {
        sentCount++;
      } else {
        failedCount++;
      }
      details.push(result);
    });

    await Promise.all(emailPromises);

    return res.json({
      success: true,
      sent: sentCount,
      failed: failedCount,
      details: details,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error while sending emails',
      error: error.message
    });
  }
});

// View sent emails (for local development)
app.get('/emails', (req, res) => {
  res.json(emailStore);
});

// View email HTML interface
app.get('/view-emails', async (req, res) => {
  // Create a simple HTML interface
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Email Viewer</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .email { border: 1px solid #ddd; margin: 10px 0; padding: 10px; border-radius: 5px; }
        .email-header { background: #f8f8f8; padding: 10px; }
        .email-body { padding: 10px; }
        h1 { color: #333; }
      </style>
    </head>
    <body>
      <h1>Email Viewer</h1>
      <div id="emails-container"></div>
      
      <script>
        // Fetch emails and display them
        fetch('/emails')
          .then(response => response.json())
          .then(emails => {
            const container = document.getElementById('emails-container');
            if (emails.length === 0) {
              container.innerHTML = '<p>No emails sent yet.</p>';
              return;
            }
            
            emails.forEach(email => {
              const emailDiv = document.createElement('div');
              emailDiv.className = 'email';
              emailDiv.innerHTML = \`
                <div class="email-header">
                  <strong>From:</strong> \${email.from}<br>
                  <strong>To:</strong> \${email.to}<br>
                  <strong>Subject:</strong> \${email.subject}<br>
                  <strong>Sent:</strong> \${new Date(email.timestamp).toLocaleString()}
                </div>
                <div class="email-body">
                  \${email.html || email.text}
                </div>
              \`;
              container.appendChild(emailDiv);
            });
          })
          .catch(error => {
            console.error('Error fetching emails:', error);
          });
      </script>
    </body>
    </html>
  `;
  res.send(html);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Bulk Email Sender running on port ${PORT}`);
  console.log(`Email viewer available at: http://localhost:${PORT}/view-emails`);
});