require("dotenv").config();
const nodemailer = require("nodemailer");

async function sendTestEmail() {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: "vs4676914@gmail.com",   // change this
      subject: "VFSTR Report Test",
      text: "SMTP is working successfully 🚀"
    });

    console.log("Email sent:", info.messageId);
  } catch (error) {
    console.error("Error:", error);
  }
}

sendTestEmail();