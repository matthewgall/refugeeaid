-- Migration number: 0000 	 2023-10-17T11:35:28.160Z

DROP TABLE IF EXISTS SOSRequest;
CREATE TABLE SOSRequest (id INTEGER PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    others_name TEXT,
    email TEXT,
    phone_number TEXT,
    location_description TEXT,
    need TEXT,
    other_need TEXT,
    us_citizen INTEGER,
    latitude TEXT,
    longitude TEXT,
    photo_urls TEXT,
    created_at TEXT
);