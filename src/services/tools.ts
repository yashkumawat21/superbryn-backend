import { createOrUpdateUser, getUser, createAppointment, getAppointments, cancelAppointment, modifyAppointment, getAppointmentById } from '../db/queries.js';
import { getAvailableSlots } from '../config/slots.js';
import { format, parse } from 'date-fns';

export interface ToolCall {
  name: string;
  arguments: any;
  result?: any;
  error?: string;
}

export interface CostBreakdown {
  service: string;
  cost: number;
  unit: string;
}

export const costTracker: CostBreakdown[] = [];

export function addCost(service: string, cost: number, unit: string = 'request') {
  costTracker.push({ service, cost, unit });
}

export function getTotalCost(): number {
  return costTracker.reduce((sum, item) => sum + item.cost, 0);
}

export function resetCost() {
  costTracker.length = 0;
}

// Tool definitions for LLM
export const toolDefinitions = [
  {
    type: 'function' as const,
    function: {
      name: 'identify_user',
      description: 'Ask for and store user contact information to identify the user',
      parameters: {
        type: 'object',
        properties: {
          contact_number: {
            type: 'string',
            description: 'User\'s phone number (e.g., +1234567890)',
          },
          name: {
            type: 'string',
            description: 'User\'s name (optional)',
          },
          email: {
            type: 'string',
            description: 'User\'s email address (optional)',
          },
        },
        required: ['contact_number'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'fetch_slots',
      description: 'Get available appointment slots. Can filter by date.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Optional date filter (YYYY-MM-DD format)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'book_appointment',
      description: 'Book an appointment for the user. Requires contact_number, date, and time.',
      parameters: {
        type: 'object',
        properties: {
          contact_number: {
            type: 'string',
            description: 'User\'s contact number',
          },
          appointment_date: {
            type: 'string',
            description: 'Appointment date in YYYY-MM-DD format',
          },
          appointment_time: {
            type: 'string',
            description: 'Appointment time in HH:MM format (24-hour)',
          },
          service_type: {
            type: 'string',
            description: 'Type of service (optional)',
          },
          notes: {
            type: 'string',
            description: 'Additional notes (optional)',
          },
        },
        required: ['contact_number', 'appointment_date', 'appointment_time'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'retrieve_appointments',
      description: 'Get all appointments for a user',
      parameters: {
        type: 'object',
        properties: {
          contact_number: {
            type: 'string',
            description: 'User\'s contact number',
          },
          status: {
            type: 'string',
            description: 'Filter by status: confirmed, cancelled, or completed (optional)',
          },
        },
        required: ['contact_number'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'cancel_appointment',
      description: 'Cancel a specific appointment',
      parameters: {
        type: 'object',
        properties: {
          contact_number: {
            type: 'string',
            description: 'User\'s contact number',
          },
          appointment_id: {
            type: 'number',
            description: 'ID of the appointment to cancel',
          },
        },
        required: ['contact_number', 'appointment_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'modify_appointment',
      description: 'Modify date or time of an existing appointment',
      parameters: {
        type: 'object',
        properties: {
          contact_number: {
            type: 'string',
            description: 'User\'s contact number',
          },
          appointment_id: {
            type: 'number',
            description: 'ID of the appointment to modify',
          },
          new_date: {
            type: 'string',
            description: 'New appointment date in YYYY-MM-DD format (optional)',
          },
          new_time: {
            type: 'string',
            description: 'New appointment time in HH:MM format (optional)',
          },
        },
        required: ['contact_number', 'appointment_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'end_conversation',
      description: 'End the conversation. Use this when the user wants to end the call.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
];

// Tool execution functions
export async function executeTool(toolCall: ToolCall): Promise<any> {
  const { name, arguments: args } = toolCall;

  try {
    switch (name) {
      case 'identify_user': {
        addCost('identify_user', 0.001, 'call');
        const user = await createOrUpdateUser(
          args.contact_number,
          args.name,
          args.email
        );
        return {
          success: true,
          message: `User identified: ${args.contact_number}`,
          user,
        };
      }

      case 'fetch_slots': {
        addCost('fetch_slots', 0.001, 'call');
        const slots = getAvailableSlots(args.date);
        return {
          success: true,
          slots: slots.map(s => ({ date: s.date, time: s.time })),
          count: slots.length,
        };
      }

      case 'book_appointment': {
        addCost('book_appointment', 0.002, 'call');
        const appointment = await createAppointment(
          args.contact_number,
          args.appointment_date,
          args.appointment_time,
          args.service_type,
          args.notes
        );
        return {
          success: true,
          message: 'Appointment booked successfully',
          appointment: {
            id: appointment.id,
            date: appointment.appointment_date,
            time: appointment.appointment_time,
            service_type: appointment.service_type,
          },
        };
      }

      case 'retrieve_appointments': {
        addCost('retrieve_appointments', 0.001, 'call');
        const appointments = await getAppointments(
          args.contact_number,
          args.status
        );
        return {
          success: true,
          appointments: appointments.map(apt => ({
            id: apt.id,
            date: apt.appointment_date,
            time: apt.appointment_time,
            service_type: apt.service_type,
            status: apt.status,
            notes: apt.notes,
          })),
          count: appointments.length,
        };
      }

      case 'cancel_appointment': {
        addCost('cancel_appointment', 0.002, 'call');
        const appointment = await cancelAppointment(
          args.appointment_id,
          args.contact_number
        );
        if (!appointment) {
          throw new Error('Appointment not found or already cancelled');
        }
        return {
          success: true,
          message: 'Appointment cancelled successfully',
          appointment: {
            id: appointment.id,
            date: appointment.appointment_date,
            time: appointment.appointment_time,
          },
        };
      }

      case 'modify_appointment': {
        addCost('modify_appointment', 0.002, 'call');
        const appointment = await modifyAppointment(
          args.appointment_id,
          args.contact_number,
          args.new_date,
          args.new_time
        );
        if (!appointment) {
          throw new Error('Appointment not found');
        }
        return {
          success: true,
          message: 'Appointment modified successfully',
          appointment: {
            id: appointment.id,
            date: appointment.appointment_date,
            time: appointment.appointment_time,
          },
        };
      }

      case 'end_conversation': {
        addCost('end_conversation', 0.001, 'call');
        return {
          success: true,
          message: 'Conversation ended',
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    console.error(`Tool execution error for ${name}:`, error);
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}
