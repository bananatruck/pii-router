// All values are synthetic; cards and IBANs are published test examples, and the SSN is a publicly voided specimen.
// Expected values are authored independently of the detectors.
export const SYNTHETIC_INPUTS: Array<{ text: string; sensitiveValues: string[] }> = [
  {
    text: "Customer Alice Example asks for a refund. Email alice@example.com or call 202-555-0100.",
    sensitiveValues: ["Alice Example", "alice@example.com", "202-555-0100"],
  },
  {
    text: "Customer James Sample ordered delivery to 14 Maple Street. Contact james@example.org.",
    sensitiveValues: ["James Sample", "14 Maple Street", "james@example.org"],
  },
  {
    text: "HR: Emily Fiction starts Monday. Her contact is emily@example.net and 415-555-0101.",
    sensitiveValues: ["Emily Fiction", "emily@example.net", "415-555-0101"],
  },
  {
    text: "Medical intake: Daniel Imaginary reports a headache. Lives at 28 Willow Road.",
    sensitiveValues: ["Daniel Imaginary", "28 Willow Road"],
  },
  {
    text: "Support ticket: Olivia Pretend cannot sign in from 192.0.2.10. Reply to olivia@example.com.",
    sensitiveValues: ["Olivia Pretend", "192.0.2.10", "olivia@example.com"],
  },
  {
    text: "Customer John Invented asks to replace card 4111 1111 1111 1111.",
    sensitiveValues: ["John Invented", "4111 1111 1111 1111"],
  },
  {
    text: "Billing note: Sarah Fable used card 5555 5555 5555 4444. Call +1 212 555 0102.",
    sensitiveValues: ["Sarah Fable", "5555 5555 5555 4444", "+1 212 555 0102"],
  },
  {
    text: "Finance: Thomas Story requests transfer to GB82 WEST 1234 5698 7654 32.",
    sensitiveValues: ["Thomas Story", "GB82 WEST 1234 5698 7654 32"],
  },
  {
    text: "HR specimen: Emma Example has SSN 078-05-1120 and email emma@example.org.",
    sensitiveValues: ["Emma Example", "078-05-1120", "emma@example.org"],
  },
  {
    text: "Medical callback: Noah Sample can be reached at (303) 555-0103.",
    sensitiveValues: ["Noah Sample", "(303) 555-0103"],
  },
  {
    text: "Support: Sophia Fiction reports timeout on 198.51.100.22. Call 6505550104.",
    sensitiveValues: ["Sophia Fiction", "198.51.100.22", "6505550104"],
  },
  {
    text: "Customer William Imaginary moved to 42 Cedar Avenue. Email william@example.net.",
    sensitiveValues: ["William Imaginary", "42 Cedar Avenue", "william@example.net"],
  },
  {
    text: "HR contact: Grace Pretend at grace@example.com. Emergency phone 202.555.0105.",
    sensitiveValues: ["Grace Pretend", "grace@example.com", "202.555.0105"],
  },
  {
    text: "Medical intake: Henry Invented lives at 71 Birch Lane and prefers email henry@example.org.",
    sensitiveValues: ["Henry Invented", "71 Birch Lane", "henry@example.org"],
  },
  {
    text: "Billing: Lily Fable provided DE89 3704 0044 0532 0130 00 for a sample refund.",
    sensitiveValues: ["Lily Fable", "DE89 3704 0044 0532 0130 00"],
  },
  {
    text: "Support: Jack Story uses jack@example.net and reported 203.0.113.5.",
    sensitiveValues: ["Jack Story", "jack@example.net", "203.0.113.5"],
  },
  {
    text: "Customer Amelia Example asks to update 88 Oak Drive. Phone 415-555-0106.",
    sensitiveValues: ["Amelia Example", "88 Oak Drive", "415-555-0106"],
  },
  {
    text: "HR: Michael Sample requests a letter addressed to 19 Pine Boulevard.",
    sensitiveValues: ["Michael Sample", "19 Pine Boulevard"],
  },
  {
    text: "Medical: Charlotte Fiction requests a callback at +1 (212) 555-0107.",
    sensitiveValues: ["Charlotte Fiction", "+1 (212) 555-0107"],
  },
  {
    text: "Support: Lucas Imaginary asks to reset lucas@example.com. Alternate LUCAS@example.com.",
    sensitiveValues: ["Lucas Imaginary", "lucas@example.com", "LUCAS@example.com"],
  },
  {
    text: "Customer Lucy Pretend supplied test card 4111-1111-1111-1111 and 303-555-0108.",
    sensitiveValues: ["Lucy Pretend", "4111-1111-1111-1111", "303-555-0108"],
  },
  {
    text: "HR: Benjamin Invented confirms the specimen number 078 05 1120.",
    sensitiveValues: ["Benjamin Invented", "078 05 1120"],
  },
  {
    text: "Medical: Anna Fable asks to send the appointment to anna@example.org. Phone 650-555-0109.",
    sensitiveValues: ["Anna Fable", "anna@example.org", "650-555-0109"],
  },
  {
    text: "Support: Ethan Story reports 192.0.2.99 from 120 Elm Street.",
    sensitiveValues: ["Ethan Story", "192.0.2.99", "120 Elm Street"],
  },
  {
    text: "Customer Hannah Example requests a receipt to hannah@example.net for card 5555555555554444.",
    sensitiveValues: ["Hannah Example", "hannah@example.net", "5555555555554444"],
  },
  {
    text: "HR: Oscar Sample confirms address 65 Spruce Road and phone 202-555-0110.",
    sensitiveValues: ["Oscar Sample", "65 Spruce Road", "202-555-0110"],
  },
  {
    text: "Medical intake: Julia Fiction requests a follow-up. Email julia@example.com.",
    sensitiveValues: ["Julia Fiction", "julia@example.com"],
  },
  {
    text: "Support: David Imaginary moved to 300 Meadow Avenue and uses david@example.net.",
    sensitiveValues: ["David Imaginary", "300 Meadow Avenue", "david@example.net"],
  },
];
