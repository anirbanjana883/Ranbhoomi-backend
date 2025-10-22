import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  service: "Gmail",
  port: 465,
  secure: true,
  auth: {
    user: process.env.USER_EMAIL,
    pass: process.env.USER_PASSWORD,
  },
});

/**
 * Send an email with customizable subject, text, and HTML.
 * @param {string} to - Recipient email address.
 * @param {string} subject - Email subject line.
 * @param {string} html - HTML body content.
 * @param {string} [text] - Optional plain text fallback.
 */
const sendMail = async (to, subject, html, text) => {
  try {
    await transporter.sendMail({
      from: `"Ranbhoomi" <${process.env.USER_EMAIL}>`,
      to,
      subject,
      text: text || "Please view this email in an HTML-compatible client.",
      html,
    });

    console.log(` Email sent to ${to} | Subject: ${subject}`);
  } catch (error) {
    console.error(" Error sending email:", error);
    throw new Error("Email could not be sent");
  }
};

export default sendMail;
