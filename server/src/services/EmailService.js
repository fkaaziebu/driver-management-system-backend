const nodemailer = require("nodemailer");
const transporter = require("../config/emailTransporter");

const sendAccountActivation = async (email, token) => {
  const info = await transporter.sendMail({
    from: "My App <info@my-app.com>",
    to: email,
    subject: "Account Activation",
    html: `
    <div>
      <h>Please click below link to activate your account</h>
    </div>
    <div>
      <a href="http://localhost:3000/driver/auth?token=${token}">Activate</a>
    </div>
    Token is ${token}`,
  });
  if (process.env.NODE_ENV === "development") {
    console.log("url: " + nodemailer.getTestMessageUrl(info));
  }
};

module.exports = { sendAccountActivation };
