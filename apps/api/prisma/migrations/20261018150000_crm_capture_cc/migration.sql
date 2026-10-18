-- Capture address visible on the message (CC), as opposed to a hidden BCC copy.
ALTER TYPE "InteractionSource" ADD VALUE IF NOT EXISTS 'CC';
