import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    service: "Gmail",
    port: 465,
    secure: true,
    auth: {
        user: process.env.USER_EMAIL,
        pass: process.env.USER_PASSWORD,
    },
});

export const sendMail = async (to, subject, html, text) => {
    try {
        await transporter.sendMail({
            from: `"Ranbhoomi" <${process.env.USER_EMAIL}>`,
            to,
            subject,
            text: text || "Please view this email in an HTML-compatible client.",
            html,
        });
    } catch (error) {
        console.error("Mailer Error:", error);
        throw new Error("Email could not be sent");
    }
};