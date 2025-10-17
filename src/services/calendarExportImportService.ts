import Calendar, { ICalendar, CalendarStatus, CalendarChannel } from '../models/Calendar';
import { logger } from '../config/logger';
import { createError } from '../utils/errors';
import { Parser } from 'json2csv';
import iCal, { ICalEventStatus } from 'ical-generator';
import mongoose from 'mongoose';

// Export format enum
export enum ExportFormat {
  JSON = 'json',
  CSV = 'csv',
  ICAL = 'ical',
  EXCEL = 'excel'
}

// Import result interface
export interface IImportResult {
  success: boolean;
  imported: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

class CalendarExportImportService {
  /**
   * Export calendar data
   */
  public async exportCalendar(
    propertyId: string,
    roomId: string,
    startDate: Date,
    endDate: Date,
    format: ExportFormat = ExportFormat.JSON
  ): Promise<string> {
    try {
      logger.info(`Exporting calendar: property ${propertyId}, room ${roomId}, format ${format}`);

      // Get calendar data
      const calendars = await Calendar.find({
        property: propertyId,
        room: roomId,
        date: { $gte: startDate, $lte: endDate }
      }).sort({ date: 1 }).populate('property room booking');

      // Export based on format
      switch (format) {
        case ExportFormat.JSON:
          return this.exportToJSON(calendars);
        case ExportFormat.CSV:
          return this.exportToCSV(calendars);
        case ExportFormat.ICAL:
          return this.exportToiCal(calendars);
        default:
          throw createError.validation('Unsupported export format');
      }
    } catch (error) {
      logger.error('Export failed:', error);
      throw createError.calendar(`Export failed: ${(error as Error).message}`);
    }
  }

  /**
   * Export to JSON
   */
  private exportToJSON(calendars: ICalendar[]): string {
    const data = calendars.map(cal => ({
      date: cal.date,
      status: cal.status,
      rate: cal.rate,
      currency: cal.currency,
      minStay: cal.minStay,
      maxStay: cal.maxStay,
      channel: cal.channel,
      blockReason: cal.blockReason,
      blockDescription: cal.blockDescription
    }));

    return JSON.stringify(data, null, 2);
  }

  /**
   * Export to CSV
   */
  private exportToCSV(calendars: ICalendar[]): string {
    const fields = [
      'date',
      'status',
      'rate',
      'currency',
      'minStay',
      'maxStay',
      'channel',
      'blockReason',
      'blockDescription'
    ];

    const data = calendars.map(cal => ({
      date: cal.date.toISOString().split('T')[0],
      status: cal.status,
      rate: cal.rate || '',
      currency: cal.currency || '',
      minStay: cal.minStay || '',
      maxStay: cal.maxStay || '',
      channel: cal.channel,
      blockReason: cal.blockReason || '',
      blockDescription: cal.blockDescription || ''
    }));

    const parser = new Parser({ fields });
    return parser.parse(data);
  }

  /**
   * Export to iCal format
   */
  private exportToiCal(calendars: ICalendar[]): string {
    const calendar = iCal({ name: 'Property Calendar', timezone: 'UTC' });

    for (const cal of calendars) {
      if (cal.status === CalendarStatus.BOOKED || cal.status === CalendarStatus.BLOCKED) {
        const event = calendar.createEvent({
          start: cal.date,
          end: new Date(cal.date.getTime() + 24 * 60 * 60 * 1000),
          summary: cal.status === CalendarStatus.BOOKED ? 'Booked' : 'Blocked',
          description: cal.blockDescription || `Status: ${cal.status}`
        });
        // Set status using the method with enum value
        event.status(cal.status === CalendarStatus.BOOKED ? ICalEventStatus.CONFIRMED : ICalEventStatus.TENTATIVE);
      }
    }

    return calendar.toString();
  }

  /**
   * Import calendar data from JSON
   */
  public async importFromJSON(
    propertyId: string,
    roomId: string,
    jsonData: string,
    channel: CalendarChannel,
    userId?: string
  ): Promise<IImportResult> {
    try {
      logger.info(`Importing calendar from JSON: property ${propertyId}, room ${roomId}`);

      const data = JSON.parse(jsonData);
      if (!Array.isArray(data)) {
        throw createError.validation('Invalid JSON format: expected array');
      }

      return await this.importCalendarData(propertyId, roomId, data, channel, userId);
    } catch (error) {
      logger.error('JSON import failed:', error);
      throw createError.calendar(`JSON import failed: ${(error as Error).message}`);
    }
  }

  /**
   * Import calendar data from CSV
   */
  public async importFromCSV(
    propertyId: string,
    roomId: string,
    csvData: string,
    channel: CalendarChannel,
    userId?: string
  ): Promise<IImportResult> {
    try {
      logger.info(`Importing calendar from CSV: property ${propertyId}, room ${roomId}`);

      // Parse CSV
      const lines = csvData.split('\n');
      const headers = lines[0].split(',').map(h => h.trim());

      const data = lines.slice(1).map((line, _index) => {
        const values = line.split(',').map(v => v.trim());
        const row: Record<string, string> = {};

        headers.forEach((header, i) => {
          row[header] = values[i] || '';
        });

        return row;
      }).filter(row => row.date); // Filter out empty rows

      return await this.importCalendarData(propertyId, roomId, data, channel, userId);
    } catch (error) {
      logger.error('CSV import failed:', error);
      throw createError.calendar(`CSV import failed: ${(error as Error).message}`);
    }
  }

  /**
   * Import calendar data
   */
  private async importCalendarData(
    propertyId: string,
    roomId: string,
    data: Array<Record<string, unknown>>,
    channel: CalendarChannel,
    userId?: string
  ): Promise<IImportResult> {
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      try {
        // Validate required fields
        if (!row.date) {
          throw new Error('Missing required field: date');
        }

        const date = new Date(row.date as string);
        if (isNaN(date.getTime())) {
          throw new Error('Invalid date format');
        }

        // Check if calendar entry exists
        let calendar = await Calendar.findOne({
          property: propertyId,
          room: roomId,
          date
        });

        if (calendar) {
          // Update existing
          calendar.status = (row.status as CalendarStatus) || calendar.status;
          calendar.rate = row.rate ? Number(row.rate) : calendar.rate;
          calendar.currency = (row.currency as string) || calendar.currency;
          calendar.minStay = row.minStay ? Number(row.minStay) : calendar.minStay;
          calendar.maxStay = row.maxStay ? Number(row.maxStay) : calendar.maxStay;
          calendar.channel = channel;
          if (userId) calendar.lastUpdatedBy = new mongoose.Types.ObjectId(userId);

          await calendar.save();
          updated++;
        } else {
          // Create new
          calendar = new Calendar({
            property: propertyId,
            room: roomId,
            date,
            status: (row.status as CalendarStatus) || CalendarStatus.AVAILABLE,
            rate: row.rate ? Number(row.rate) : undefined,
            currency: (row.currency as string) || 'USD',
            minStay: row.minStay ? Number(row.minStay) : 1,
            maxStay: row.maxStay ? Number(row.maxStay) : undefined,
            channel,
            lastUpdatedBy: userId ? new mongoose.Types.ObjectId(userId) : undefined
          });

          await calendar.save();
          imported++;
        }
      } catch (error) {
        errors.push({ row: i + 1, error: (error as Error).message });
        skipped++;
      }
    }

    logger.info(`Import completed: ${imported} imported, ${updated} updated, ${skipped} skipped, ${errors.length} errors`);

    return {
      success: errors.length === 0,
      imported,
      updated,
      skipped,
      errors
    };
  }

  /**
   * Import from iCal URL (for external calendar sync)
   */
  public async importFromiCalURL(
    propertyId: string,
    roomId: string,
    iCalURL: string,
    channel: CalendarChannel,
    userId?: string
  ): Promise<IImportResult> {
    try {
      logger.info(`Importing calendar from iCal URL: ${iCalURL}`);

      // Fetch iCal data
      const response = await fetch(iCalURL);
      if (!response.ok) {
        throw new Error(`Failed to fetch iCal: ${response.statusText}`);
      }

      const iCalData = await response.text();

      return await this.importFromiCal(propertyId, roomId, iCalData, channel, userId);
    } catch (error) {
      logger.error('iCal URL import failed:', error);
      throw createError.calendar(`iCal URL import failed: ${(error as Error).message}`);
    }
  }

  /**
   * Import from iCal data
   */
  public async importFromiCal(
    propertyId: string,
    roomId: string,
    iCalData: string,
    channel: CalendarChannel,
    userId?: string
  ): Promise<IImportResult> {
    try {
      logger.info(`Importing calendar from iCal data`);

      // Parse iCal (simple parsing - in production, use a proper iCal library)
      const events = this.parseiCal(iCalData);

      return await this.importCalendarData(propertyId, roomId, events, channel, userId);
    } catch (error) {
      logger.error('iCal import failed:', error);
      throw createError.calendar(`iCal import failed: ${(error as Error).message}`);
    }
  }

  /**
   * Simple iCal parser
   */
  private parseiCal(iCalData: string): Array<Record<string, unknown>> {
    const events: Array<Record<string, unknown>> = [];
    const lines = iCalData.split('\n');

    let inEvent = false;
    let currentEvent: Record<string, unknown> = {};

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === 'BEGIN:VEVENT') {
        inEvent = true;
        currentEvent = {};
      } else if (trimmed === 'END:VEVENT') {
        inEvent = false;
        if (currentEvent.date) {
          events.push(currentEvent);
        }
      } else if (inEvent) {
        const [key, value] = trimmed.split(':');
        if (key === 'DTSTART' || key === 'DTSTART;VALUE=DATE') {
          currentEvent.date = value;
        } else if (key === 'SUMMARY') {
          currentEvent.status = value.toLowerCase().includes('booked')
            ? CalendarStatus.BOOKED
            : CalendarStatus.BLOCKED;
        }
      }
    }

    return events;
  }
}

// Singleton instance
export const calendarExportImportService = new CalendarExportImportService();
export default calendarExportImportService;
