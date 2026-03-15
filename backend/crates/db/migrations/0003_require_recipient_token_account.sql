-- Make recipient and token_account required for lifecycle requests.
UPDATE lifecycle_requests SET recipient = '' WHERE recipient IS NULL;
UPDATE lifecycle_requests SET token_account = '' WHERE token_account IS NULL;
ALTER TABLE lifecycle_requests ALTER COLUMN recipient SET NOT NULL;
ALTER TABLE lifecycle_requests ALTER COLUMN token_account SET NOT NULL;
