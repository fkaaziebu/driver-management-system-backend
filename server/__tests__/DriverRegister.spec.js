const request = require("supertest");
const app = require("../app");
const Driver = require("../src/models/Driver");
const sequelize = require("../src/config/database");
const SMTPServer = require("smtp-server").SMTPServer;

/* MAIL SERVICE */
let lastMail, server;
let simulateSmtpFailure = false;

// Hook that runs before the tests are runned
beforeAll(async () => {
  server = new SMTPServer({
    authOptional: true,
    onData(stream, session, callback) {
      let mailBody;
      stream.on("data", (data) => {
        mailBody += data.toString();
      });
      stream.on("end", () => {
        if (simulateSmtpFailure) {
          const err = new Error("Invalid mailbox");
          err.responseCode = 553;
          return callback(err);
        }
        lastMail = mailBody;
        callback();
      });
    },
  });
  await server.listen(8687, "localhost");
  await sequelize.sync();
});

// Hook that runs before each test is runned
beforeEach(() => {
  simulateSmtpFailure = false;
  return Driver.destroy({ truncate: true });
});

afterAll(async () => {
  await server.close();
});

validUser = {
  username: "user1",
  email: "user1@mail.com",
  contact: "0550815604",
  password: "P4ssword",
};

const postUser = (user = validUser) => {
  return request(app).post("/api/1.0/drivers/auth").send(user);
};

describe("Driver Registration", () => {
  /* VALID REQUEST */
  it("returns 200 Ok when driver signup request is valid", async () => {
    const response = await postUser();
    expect(response.status).toBe(200);
  });
  it("returns success message when signup request is valid", async () => {
    const response = await postUser();
    expect(response.body.message).toBe("Driver created");
  });
  it("saves the user to database", async () => {
    await postUser();
    const driverList = await Driver.findAll();
    expect(driverList.length).toBe(1);
  });
  it("saves the username, email and contact to database", async () => {
    await postUser();
    const drivers = await Driver.findAll();
    driver = drivers[0];
    expect(driver.username).toBe("user1");
    expect(driver.email).toBe("user1@mail.com");
    expect(driver.contact).toBe("0550815604");
  });
  it("hashes password to database", async () => {
    await postUser();
    const drivers = await Driver.findAll();
    driver = drivers[0];
    expect(driver.password).not.toBe("P4ssword");
  });

  /* INVALID REQUEST */
  it("returns 400 when username is null", async () => {
    const response = await postUser({
      ...validUser,
      username: null,
    });
    expect(response.status).toBe(400);
  });
  it("returns a validationError field in response body when validation error occur", async () => {
    const response = await postUser({
      ...validUser,
      username: null,
    });
    const body = response.body;
    expect(body.validationErrors).not.toBeUndefined();
  });
  it("returns errors for both when username and email is null", async () => {
    const response = await postUser({
      ...validUser,
      username: null,
      email: null,
    });
    expect(Object.keys(response.body.validationErrors)).toEqual([
      "username",
      "email",
    ]);
  });

  //Dynamic test for similar test
  it.each`
    field         | value              | expectedMessage
    ${"username"} | ${null}            | ${"Username cannot be null"}
    ${"email"}    | ${null}            | ${"Email cannot be null"}
    ${"contact"}  | ${null}            | ${"Contact cannot be null"}
    ${"password"} | ${null}            | ${"Password cannot be null"}
    ${"username"} | ${"usr"}           | ${"Must have min 4 and max 32 characters"}
    ${"username"} | ${"a".repeat(33)}  | ${"Must have min 4 and max 32 characters"}
    ${"email"}    | ${"mail.com"}      | ${"Email is not valid"}
    ${"email"}    | ${"user.mail.com"} | ${"Email is not valid"}
    ${"email"}    | ${"user@mail"}     | ${"Email is not valid"}
    ${"contact"}  | ${"055"}           | ${"Must be equal to 10 characters"}
    ${"contact"}  | ${"05508156041"}   | ${"Must be equal to 10 characters"}
    ${"password"} | ${"P4ssw"}         | ${"Password must be atleast 6 characters"}
    ${"password"} | ${"alllowercase"}  | ${"Password must have at least 1 uppercase, 1 lowercase letter and 1 number"}
    ${"password"} | ${"ALLUPPERCASE"}  | ${"Password must have at least 1 uppercase, 1 lowercase letter and 1 number"}
    ${"password"} | ${"1234567890"}    | ${"Password must have at least 1 uppercase, 1 lowercase letter and 1 number"}
    ${"password"} | ${"lowerandUPPER"} | ${"Password must have at least 1 uppercase, 1 lowercase letter and 1 number"}
    ${"password"} | ${"lower4nd5667"}  | ${"Password must have at least 1 uppercase, 1 lowercase letter and 1 number"}
    ${"password"} | ${"UPPER44444"}    | ${"Password must have at least 1 uppercase, 1 lowercase letter and 1 number"}
  `(
    "returns $expectedMessage when $field is $value",
    async ({ field, expectedMessage, value }) => {
      const user = {
        username: "user1",
        email: "user1@mail.com",
        contact: "0550815604",
        password: "P4ssword",
      };
      user[field] = value;
      const response = await postUser(user);
      const body = response.body;
      expect(body.validationErrors[field]).toBe(expectedMessage);
    }
  );
  it("returns Email in use when same email is already in use", async () => {
    await Driver.create({ ...validUser });
    const response = await postUser();
    expect(response.body.validationErrors.email).toBe("Email in use");
  });
  it("returns errors for both username is null and email in use", async () => {
    await Driver.create({ ...validUser });
    const response = await postUser({
      username: null,
      email: validUser.email,
      contact: "0550815604",
      password: "P4ssword",
    });

    const body = response.body;
    expect(Object.keys(body.validationErrors)).toEqual(["username", "email"]);
  });
  it("returns errors for username is null, email in use and contact is null", async () => {
    await Driver.create({ ...validUser });
    const response = await postUser({
      username: null,
      email: validUser.email,
      contact: null,
      password: "P4ssword",
    });

    const body = response.body;
    expect(Object.keys(body.validationErrors)).toEqual([
      "username",
      "email",
      "contact",
    ]);
  });
  it("creates driver in inactive mode", async () => {
    await postUser();
    const users = await Driver.findAll();
    expect(users[0].inactive).toBe(true);
  });
  it("creates the driver in inactive mode when the request body contains inactive as false", async () => {
    await postUser({ ...validUser, inactive: false });
    const users = await Driver.findAll();
    expect(users[0].inactive).toBe(true);
  });
  it("creates an activationToken for user", async () => {
    await postUser();
    const users = await Driver.findAll();
    expect(users[0].activationToken).toBeTruthy();
  });

  /* Valid Email request */
  it("sends an account activation email with activationToken", async () => {
    await postUser();
    const users = await Driver.findAll();
    const savedUser = users[0];
    expect(lastMail).toContain("user1@mail.com");
    expect(lastMail).toContain(savedUser.activationToken);
  });

  /* Invalid Email request */
  it("returns 502 Bad Gateway when sending email fails", async () => {
    simulateSmtpFailure = true;
    const response = await postUser();
    expect(response.status).toBe(502);
  });
  it("does not save user to database if activation email fails", async () => {
    simulateSmtpFailure = true;
    await postUser();
    const users = await Driver.findAll();
    expect(users.length).toBe(0);
  });
  it("returns Validation Failure message in error response body when validation fails", async () => {
    await Driver.create({ ...validUser });
    const response = await postUser({
      username: null,
      email: validUser.email,
      contact: "0550815604",
      password: "P4ssword",
    });
    expect(response.body.message).toEqual("Validation Failure");
  });
});

// Activation of User Account
describe("Account activation", () => {
  const account_activation_failure =
    "This account is either active or the token is invalid";
  const account_activation_success = "Account is activated";

  it("activates the account when correct token is sent", async () => {
    await postUser();
    let users = await Driver.findAll();
    const token = users[0].activationToken;

    await request(app)
      .post("/api/1.0/driver/auth/token/" + token)
      .send();
    users = await Driver.findAll();
    expect(users[0].inactive).toBe(false);
  });
  it("removes the token from user table after success actvation", async () => {
    await postUser();
    let users = await Driver.findAll();
    const token = users[0].activationToken;

    await request(app)
      .post("/api/1.0/driver/auth/token/" + token)
      .send();
    users = await Driver.findAll();
    expect(users[0].activationToken).toBeFalsy();
  });
  it("does not activate the account when token is wrong", async () => {
    await postUser();
    let users = await Driver.findAll();
    const token = "this-token-does-not-exist";

    await request(app)
      .post("/api/1.0/driver/auth/token/" + token)
      .send();
    users = await Driver.findAll();
    expect(users[0].inactive).toBe(true);
  });
  it("returns bad request when token is wrong", async () => {
    await postUser();
    const token = "this-token-does-not-exist";

    const response = await request(app)
      .post("/api/1.0/driver/auth/token/" + token)
      .send();
    expect(response.status).toBe(400);
  });

  it.each`
    tokenStatus  | message
    ${"wrong"}   | ${account_activation_failure}
    ${"correct"} | ${account_activation_success}
  `(
    "returns $message when token is $tokenStatus",
    async ({ message, tokenStatus }) => {
      await postUser();
      let token = "this-token-does-not-exist";
      if (tokenStatus === "correct") {
        const users = await Driver.findAll();
        token = users[0].activationToken;
      }
      const response = await request(app)
        .post("/api/1.0/driver/auth/token/" + token)
        .send();
      expect(response.body.message).toBe(message);
    }
  );
});

// Error model cases
describe("Error Model", () => {
  it("returns path, timestamp, message and validationErrors in response when validation failure", async () => {
    const response = await postUser({ ...validUser, username: null });
    const body = response.body;
    expect(Object.keys(body)).toEqual([
      "path",
      "timestamp",
      "message",
      "validationErrors",
    ]);
  });
  it("returns path, timestamp and message in response when request fails other than validation error", async () => {
    const token = "this-token-does-not-exist";
    const response = await request(app)
      .post("/api/1.0/driver/auth/token/" + token)
      .send();
    const body = response.body;
    expect(Object.keys(body)).toEqual(["path", "timestamp", "message"]);
  });
  it("returns path in error body", async () => {
    const token = "this-token-does-not-exist";
    const response = await request(app)
      .post("/api/1.0/driver/auth/token/" + token)
      .send();
    const body = response.body;
    expect(body.path).toEqual("/api/1.0/driver/auth/token/" + token);
  });
  it("returns timestamp in milliseconds within 5 seconds in error body", async () => {
    const nowInMillis = new Date().getTime();
    const FiveSecondsLater = nowInMillis + 5 * 1000;
    const token = "this-token-does-not-exist";
    const response = await request(app)
      .post("/api/1.0/driver/auth/token/" + token)
      .send();
    const body = response.body;
    expect(body.timestamp).toBeGreaterThan(nowInMillis);
    expect(body.timestamp).toBeLessThan(FiveSecondsLater);
  });
});
