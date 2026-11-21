-- Pipeline cards: the card's own contact first and last name (when no person is linked).
ALTER TABLE "Lead" ADD COLUMN "contactFirstName" TEXT, ADD COLUMN "contactLastName" TEXT;
