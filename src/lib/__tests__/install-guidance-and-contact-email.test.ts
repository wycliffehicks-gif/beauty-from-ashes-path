import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const landing = read("src/components/LandingPage.tsx");
const contact = read("src/routes/contact-support.tsx");
const feedback = read("src/routes/pilot-feedback.tsx");
const privacy = read("src/routes/privacy.tsx");
const terms = read("src/routes/terms.tsx");
const important = read("src/routes/important-information.tsx");

const EMAIL = "wycliffe.hicks@gmail.com";
const MAILTO = `mailto:${EMAIL}`;

describe("landing page Home Screen guidance", () => {
  it("uses the approved optional heading and browser-only framing", () => {
    expect(landing).toContain("Add it to your Home Screen (optional)");
    expect(landing).toContain(
      "Beauty from Ashes is a web app. You can use it in your browser, or add an icon to your",
    );
    expect(landing).toContain("It is not downloaded from an app store.");
  });

  it("lists the iPhone or iPad — Safari steps exactly", () => {
    expect(landing).toContain("iPhone or iPad — Safari");
    for (const step of [
      "Open this page in Safari.",
      "Tap the Share button.",
      "Scroll down and tap Add to Home Screen.",
      "If shown, turn on Open as Web App, then tap Add.",
    ]) {
      expect(landing).toContain(step);
    }
  });

  it("lists the Android — Chrome steps exactly", () => {
    expect(landing).toContain("Android — Chrome");
    for (const step of [
      "Open this page in Chrome.",
      "Tap the three-dot More menu.",
      "Tap Install app or Add to Home screen.",
      "Follow the prompt to finish.",
    ]) {
      expect(landing).toContain(step);
    }
  });

  it("keeps the no-sync / no-transfer caution", () => {
    expect(landing).toContain("Progress does not sync or transfer between browsers or devices.");
    expect(landing).toContain("Menu");
    expect(landing).toContain("wording can vary by device and browser.");
  });

  it("adds no install-prompt javascript or device detection", () => {
    expect(landing).not.toMatch(/beforeinstallprompt|navigator\.userAgent|serviceWorker/);
  });
});

describe("contact email placement", () => {
  it("landing page carries the secondary non-urgent line with a mailto link", () => {
    expect(landing).toContain("General, non-urgent questions:");
    expect(landing).toContain(MAILTO);
    expect(landing).toContain("Not for crisis support, emergencies, or clinical advice.");
  });

  it("contact & support page states the boundary in full", () => {
    expect(contact).toContain("General, non-urgent questions");
    expect(contact).toContain(MAILTO);
    expect(contact).toContain(EMAIL);
    expect(contact).toContain("This inbox is not monitored continuously. It is not a crisis service");
    expect(contact).toContain(
      "Please do not send journal entries or sensitive personal or health",
    );
    expect(contact).toContain("ordinary email is not a secure or confidential");
    expect(contact).not.toContain("ResurgenceTherapeutics.ca");
  });

  it("pilot feedback page links a prefilled-subject mailto with no body", () => {
    expect(feedback).toContain("Email pilot feedback");
    expect(feedback).toContain(
      "mailto:wycliffe.hicks@gmail.com?subject=Beauty%20from%20Ashes%20Pilot%20Feedback",
    );
    expect(feedback).not.toContain("&body=");
    expect(feedback).toContain(
      "This inbox is not monitored continuously and is not a crisis or clinical-support service.",
    );
    expect(feedback).toContain("Please do not email confidential, identifying, or health information");
    expect(feedback).not.toContain("ResurgenceTherapeutics.ca");
  });

  it("privacy page uses the linked email with the sensitive-information caution", () => {
    expect(privacy).toContain("For questions about this Privacy Notice, email");
    expect(privacy).toContain(MAILTO);
    expect(privacy).toContain("Please do not include sensitive personal or health information");
  });

  it("terms page uses the linked email with the no-crisis caution", () => {
    expect(terms).toContain("For non-urgent questions about these Terms, email");
    expect(terms).toContain(MAILTO);
    expect(terms).toContain("This address does not provide crisis support or clinical advice.");
  });

  it("important information page adds the contact line separate from emergency resources", () => {
    expect(important).toContain(
      "For general, non-urgent questions about the app or pilot, email",
    );
    expect(important).toContain(MAILTO);
    const contactIdx = important.indexOf("For general, non-urgent questions about the app");
    const emergencyIdx = important.indexOf("If safety is at immediate risk");
    expect(contactIdx).toBeGreaterThan(-1);
    expect(emergencyIdx).toBeGreaterThan(contactIdx);
  });
});

describe("crisis copy and links unchanged", () => {
  it("keeps 911 and 988 call/text links on Important Information", () => {
    expect(important).toContain('href="tel:911"');
    expect(important).toContain('href="tel:988"');
    expect(important).toContain('href="sms:988"');
    expect(important).toContain("Call 988");
    expect(important).toContain("Text 988");
    expect(important.replace(/\s+/g, " ")).toContain(
      "The service describes its support as free and confidential; limits may apply when immediate safety is at risk.",
    );
  });

  it("keeps the crisis caveat sentence on Support & Safety", () => {
    const support = read("src/routes/_shell.support.tsx");
    expect(support.replace(/\s+/g, " ")).toContain(
      "These services describe their support as free and confidential; limits may apply when immediate safety is at risk.",
    );
  });

  it("does not put the email beside crisis actions", () => {
    const support = read("src/routes/_shell.support.tsx");
    expect(support).not.toContain(EMAIL);
  });
});
