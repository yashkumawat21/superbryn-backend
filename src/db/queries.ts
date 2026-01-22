import { query } from './connection.js';

export interface User {
  contact_number: string;
  name?: string;
  email?: string;
}

export interface Appointment {
  id: number;
  contact_number: string;
  appointment_date: string;
  appointment_time: string;
  service_type?: string;
  notes?: string;
  status: 'confirmed' | 'cancelled' | 'completed';
}

// User operations
export async function createOrUpdateUser(contactNumber: string, name?: string, email?: string) {
  const result = await query(
    `INSERT INTO users (contact_number, name, email, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (contact_number)
     DO UPDATE SET name = COALESCE(EXCLUDED.name, users.name),
                   email = COALESCE(EXCLUDED.email, users.email),
                   updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [contactNumber, name || null, email || null]
  );
  return result.rows[0];
}

export async function getUser(contactNumber: string) {
  const result = await query(
    'SELECT * FROM users WHERE contact_number = $1',
    [contactNumber]
  );
  return result.rows[0] || null;
}

// Appointment operations
export async function createAppointment(
  contactNumber: string,
  appointmentDate: string,
  appointmentTime: string,
  serviceType?: string,
  notes?: string
) {
  // Check for conflicts
  const conflictCheck = await query(
    `SELECT * FROM appointments 
     WHERE appointment_date = $1 
     AND appointment_time = $2 
     AND status = 'confirmed'`,
    [appointmentDate, appointmentTime]
  );

  if (conflictCheck.rows.length > 0) {
    throw new Error('Appointment slot already booked');
  }

  const result = await query(
    `INSERT INTO appointments (contact_number, appointment_date, appointment_time, service_type, notes, status)
     VALUES ($1, $2, $3, $4, $5, 'confirmed')
     RETURNING *`,
    [contactNumber, appointmentDate, appointmentTime, serviceType || null, notes || null]
  );
  return result.rows[0];
}

export async function getAppointments(contactNumber: string, status?: string) {
  let sql = 'SELECT * FROM appointments WHERE contact_number = $1';
  const params: any[] = [contactNumber];

  if (status) {
    sql += ' AND status = $2';
    params.push(status);
  }

  sql += ' ORDER BY appointment_date DESC, appointment_time DESC';
  
  const result = await query(sql, params);
  return result.rows;
}

export async function cancelAppointment(appointmentId: number, contactNumber: string) {
  const result = await query(
    `UPDATE appointments 
     SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND contact_number = $2
     RETURNING *`,
    [appointmentId, contactNumber]
  );
  return result.rows[0] || null;
}

export async function modifyAppointment(
  appointmentId: number,
  contactNumber: string,
  newDate?: string,
  newTime?: string
) {
  // Check for conflicts if date/time changed
  if (newDate && newTime) {
    const conflictCheck = await query(
      `SELECT * FROM appointments 
       WHERE appointment_date = $1 
       AND appointment_time = $2 
       AND status = 'confirmed'
       AND id != $3`,
      [newDate, newTime, appointmentId]
    );

    if (conflictCheck.rows.length > 0) {
      throw new Error('New appointment slot already booked');
    }
  }

  const updates: string[] = [];
  const params: any[] = [];
  let paramCount = 1;

  if (newDate) {
    updates.push(`appointment_date = $${paramCount++}`);
    params.push(newDate);
  }
  if (newTime) {
    updates.push(`appointment_time = $${paramCount++}`);
    params.push(newTime);
  }

  if (updates.length === 0) {
    throw new Error('No fields to update');
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  params.push(appointmentId, contactNumber);

  const result = await query(
    `UPDATE appointments 
     SET ${updates.join(', ')}
     WHERE id = $${paramCount++} AND contact_number = $${paramCount++}
     RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

export async function getAppointmentById(appointmentId: number, contactNumber: string) {
  const result = await query(
    'SELECT * FROM appointments WHERE id = $1 AND contact_number = $2',
    [appointmentId, contactNumber]
  );
  return result.rows[0] || null;
}

// Conversation summaries
export async function saveConversationSummary(
  contactNumber: string,
  sessionId: string,
  summary: string,
  bookedAppointments: any[],
  userPreferences: any,
  costBreakdown: any
) {
  const result = await query(
    `INSERT INTO conversation_summaries 
     (contact_number, session_id, summary, booked_appointments, user_preferences, cost_breakdown)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      contactNumber,
      sessionId,
      summary,
      JSON.stringify(bookedAppointments),
      JSON.stringify(userPreferences),
      JSON.stringify(costBreakdown),
    ]
  );
  return result.rows[0];
}
