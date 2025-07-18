CREATE TABLE sent_followup_notifications (
	house1_num INT NOT NULL,
	house2_num INT NOT NULL,
	reward_number CHAR(4) NOT NULL,
	creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (house1_num, reward_number)
);
