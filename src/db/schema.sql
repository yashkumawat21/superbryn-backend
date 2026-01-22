-- Users table
CREATE TABLE IF NOT EXISTS users (
    contact_number VARCHAR(20) PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Appointments table
CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    contact_number VARCHAR(20) NOT NULL REFERENCES users(contact_number),
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    service_type VARCHAR(255),
    notes TEXT,
    status VARCHAR(50) DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(contact_number, appointment_date, appointment_time, status)
);

-- Conversation summaries table
CREATE TABLE IF NOT EXISTS conversation_summaries (
    id SERIAL PRIMARY KEY,
    contact_number VARCHAR(20) REFERENCES users(contact_number),
    session_id VARCHAR(255) NOT NULL,
    summary TEXT NOT NULL,
    booked_appointments JSONB,
    user_preferences JSONB,
    cost_breakdown JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_appointments_contact ON appointments(contact_number);
CREATE INDEX IF NOT EXISTS idx_appointments_date_time ON appointments(appointment_date, appointment_time);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversation_summaries(contact_number);
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversation_summaries(session_id);
