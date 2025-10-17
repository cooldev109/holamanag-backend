import nodemailer from 'nodemailer';
import { EmailServiceError } from '../utils/errors';
import { logger } from '../config/logger';

// Email configuration interface
interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

// Email template interface
interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

// Email data interface
interface EmailData {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private isConfigured: boolean = false;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    try {
      const config: EmailConfig = {
        host: process.env['SMTP_HOST'] || 'smtp.gmail.com',
        port: parseInt(process.env['SMTP_PORT'] || '587'),
        secure: process.env['SMTP_SECURE'] === 'true',
        auth: {
          user: process.env['SMTP_USER'] || '',
          pass: process.env['SMTP_PASS'] || ''
        }
      };

      // Check if email is configured
      if (!config.auth.user || !config.auth.pass) {
        logger.warn('Email service not configured - SMTP credentials missing');
        return;
      }

      this.transporter = nodemailer.createTransport(config);
      this.isConfigured = true;

      // Verify connection
      this.transporter.verify((error, _success) => {
        if (error) {
          logger.error('Email service verification failed:', error);
          this.isConfigured = false;
        } else {
          logger.info('Email service verified successfully');
        }
      });

    } catch (error) {
      logger.error('Failed to initialize email service:', error);
      this.isConfigured = false;
    }
  }

  // Send email
  async sendEmail(emailData: EmailData): Promise<boolean> {
    if (!this.isConfigured || !this.transporter) {
      throw new EmailServiceError('Email service not configured');
    }

    try {
      const mailOptions = {
        from: `"${process.env['EMAIL_FROM_NAME'] || 'Reservario'}" <${process.env['SMTP_USER']}>`,
        to: Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to,
        cc: emailData.cc ? (Array.isArray(emailData.cc) ? emailData.cc.join(', ') : emailData.cc) : undefined,
        bcc: emailData.bcc ? (Array.isArray(emailData.bcc) ? emailData.bcc.join(', ') : emailData.bcc) : undefined,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
        attachments: emailData.attachments
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info('Email sent successfully', {
        messageId: result.messageId,
        to: emailData.to,
        subject: emailData.subject
      });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to send email:', {
        error: errorMessage,
        to: emailData.to,
        subject: emailData.subject
      });
      throw new EmailServiceError(`Failed to send email: ${errorMessage}`);
    }
  }

  // Send welcome email
  async sendWelcomeEmail(userEmail: string, userName: string, tempPassword?: string): Promise<boolean> {
    const template = this.getWelcomeEmailTemplate(userName, tempPassword);
    
    return this.sendEmail({
      to: userEmail,
      subject: template.subject,
      html: template.html,
      text: template.text
    });
  }

  // Send password reset email
  async sendPasswordResetEmail(userEmail: string, userName: string, resetToken: string): Promise<boolean> {
    const template = this.getPasswordResetEmailTemplate(userName, resetToken);
    
    return this.sendEmail({
      to: userEmail,
      subject: template.subject,
      html: template.html,
      text: template.text
    });
  }

  // Send booking confirmation email
  async sendBookingConfirmationEmail(
    guestEmail: string,
    guestName: string,
    bookingDetails: any
  ): Promise<boolean> {
    const template = this.getBookingConfirmationEmailTemplate(guestName, bookingDetails);
    
    return this.sendEmail({
      to: guestEmail,
      subject: template.subject,
      html: template.html,
      text: template.text
    });
  }

  // Send booking cancellation email
  async sendBookingCancellationEmail(
    guestEmail: string,
    guestName: string,
    bookingDetails: any
  ): Promise<boolean> {
    const template = this.getBookingCancellationEmailTemplate(guestName, bookingDetails);
    
    return this.sendEmail({
      to: guestEmail,
      subject: template.subject,
      html: template.html,
      text: template.text
    });
  }

  // Send new booking notification to property owner
  async sendNewBookingNotificationEmail(
    ownerEmail: string,
    ownerName: string,
    bookingDetails: any
  ): Promise<boolean> {
    const template = this.getNewBookingNotificationEmailTemplate(ownerName, bookingDetails);
    
    return this.sendEmail({
      to: ownerEmail,
      subject: template.subject,
      html: template.html,
      text: template.text
    });
  }

  // Send system notification email
  async sendSystemNotificationEmail(
    to: string | string[],
    subject: string,
    message: string,
    priority: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<boolean> {
    const template = this.getSystemNotificationEmailTemplate(subject, message, priority);
    
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text
    });
  }

  // Email templates
  private getWelcomeEmailTemplate(userName: string, tempPassword?: string): EmailTemplate {
    const subject = 'Welcome to Reservario Channel Manager';
    const hasTempPassword = !!tempPassword;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Welcome to Reservario</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f8fafc; }
          .footer { padding: 20px; text-align: center; color: #666; }
          .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 4px; }
          .password-box { background: #e5e7eb; padding: 15px; border-radius: 4px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Reservario!</h1>
          </div>
          <div class="content">
            <h2>Hello ${userName}!</h2>
            <p>Welcome to Reservario Channel Manager. Your account has been successfully created.</p>
            ${hasTempPassword ? `
              <p>Please use the following temporary password to log in:</p>
              <div class="password-box">
                <strong>Temporary Password:</strong> ${tempPassword}
              </div>
              <p><strong>Important:</strong> Please change your password after your first login for security reasons.</p>
            ` : ''}
            <p>You can now access your dashboard and start managing your properties.</p>
            <p style="text-align: center;">
              <a href="${process.env['FRONTEND_URL'] || 'http://localhost:5173'}/login" class="button">Login to Dashboard</a>
            </p>
            <p>If you have any questions, please don't hesitate to contact our support team.</p>
          </div>
          <div class="footer">
            <p>Best regards,<br>The Reservario Team</p>
            <p><small>This is an automated message. Please do not reply to this email.</small></p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Welcome to Reservario Channel Manager!
      
      Hello ${userName}!
      
      Welcome to Reservario Channel Manager. Your account has been successfully created.
      ${hasTempPassword ? `
      
      Please use the following temporary password to log in:
      Temporary Password: ${tempPassword}
      
      Important: Please change your password after your first login for security reasons.
      ` : ''}
      
      You can now access your dashboard and start managing your properties.
      
      Login URL: ${process.env['FRONTEND_URL'] || 'http://localhost:5173'}/login
      
      If you have any questions, please don't hesitate to contact our support team.
      
      Best regards,
      The Reservario Team
      
      This is an automated message. Please do not reply to this email.
    `;

    return { subject, html, text };
  }

  private getPasswordResetEmailTemplate(userName: string, resetToken: string): EmailTemplate {
    const subject = 'Password Reset Request - Reservario';
    const resetUrl = `${process.env['FRONTEND_URL'] || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Password Reset</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f8fafc; }
          .footer { padding: 20px; text-align: center; color: #666; }
          .button { display: inline-block; padding: 12px 24px; background: #dc2626; color: white; text-decoration: none; border-radius: 4px; }
          .warning { background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 4px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <h2>Hello ${userName}!</h2>
            <p>We received a request to reset your password for your Reservario account.</p>
            <p>Click the button below to reset your password:</p>
            <p style="text-align: center;">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </p>
            <div class="warning">
              <p><strong>Security Notice:</strong></p>
              <ul>
                <li>This link will expire in 1 hour</li>
                <li>If you didn't request this reset, please ignore this email</li>
                <li>Your password will remain unchanged until you create a new one</li>
              </ul>
            </div>
            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #2563eb;">${resetUrl}</p>
          </div>
          <div class="footer">
            <p>Best regards,<br>The Reservario Team</p>
            <p><small>This is an automated message. Please do not reply to this email.</small></p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Password Reset Request - Reservario
      
      Hello ${userName}!
      
      We received a request to reset your password for your Reservario account.
      
      To reset your password, please visit the following link:
      ${resetUrl}
      
      Security Notice:
      - This link will expire in 1 hour
      - If you didn't request this reset, please ignore this email
      - Your password will remain unchanged until you create a new one
      
      Best regards,
      The Reservario Team
      
      This is an automated message. Please do not reply to this email.
    `;

    return { subject, html, text };
  }

  private getBookingConfirmationEmailTemplate(guestName: string, bookingDetails: any): EmailTemplate {
    const subject = `Booking Confirmation - ${bookingDetails.propertyName}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Booking Confirmation</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #059669; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f8fafc; }
          .footer { padding: 20px; text-align: center; color: #666; }
          .booking-details { background: white; padding: 20px; border-radius: 4px; margin: 15px 0; }
          .detail-row { display: flex; justify-content: space-between; margin: 10px 0; }
          .detail-label { font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Booking Confirmed!</h1>
          </div>
          <div class="content">
            <h2>Hello ${guestName}!</h2>
            <p>Your booking has been confirmed. We're excited to host you!</p>
            <div class="booking-details">
              <h3>Booking Details</h3>
              <div class="detail-row">
                <span class="detail-label">Property:</span>
                <span>${bookingDetails.propertyName}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Room:</span>
                <span>${bookingDetails.roomName}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Check-in:</span>
                <span>${new Date(bookingDetails.checkIn).toLocaleDateString()}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Check-out:</span>
                <span>${new Date(bookingDetails.checkOut).toLocaleDateString()}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Total Amount:</span>
                <span>${bookingDetails.currency} ${bookingDetails.totalAmount}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Booking Reference:</span>
                <span>${bookingDetails.bookingId}</span>
              </div>
            </div>
            <p>If you have any questions or need to make changes to your booking, please contact us.</p>
          </div>
          <div class="footer">
            <p>Best regards,<br>The Reservario Team</p>
            <p><small>This is an automated message. Please do not reply to this email.</small></p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Booking Confirmation - ${bookingDetails.propertyName}
      
      Hello ${guestName}!
      
      Your booking has been confirmed. We're excited to host you!
      
      Booking Details:
      Property: ${bookingDetails.propertyName}
      Room: ${bookingDetails.roomName}
      Check-in: ${new Date(bookingDetails.checkIn).toLocaleDateString()}
      Check-out: ${new Date(bookingDetails.checkOut).toLocaleDateString()}
      Total Amount: ${bookingDetails.currency} ${bookingDetails.totalAmount}
      Booking Reference: ${bookingDetails.bookingId}
      
      If you have any questions or need to make changes to your booking, please contact us.
      
      Best regards,
      The Reservario Team
      
      This is an automated message. Please do not reply to this email.
    `;

    return { subject, html, text };
  }

  private getBookingCancellationEmailTemplate(guestName: string, bookingDetails: any): EmailTemplate {
    const subject = `Booking Cancellation - ${bookingDetails.propertyName}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Booking Cancellation</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f8fafc; }
          .footer { padding: 20px; text-align: center; color: #666; }
          .booking-details { background: white; padding: 20px; border-radius: 4px; margin: 15px 0; }
          .detail-row { display: flex; justify-content: space-between; margin: 10px 0; }
          .detail-label { font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Booking Cancelled</h1>
          </div>
          <div class="content">
            <h2>Hello ${guestName}!</h2>
            <p>Your booking has been cancelled as requested.</p>
            <div class="booking-details">
              <h3>Cancelled Booking Details</h3>
              <div class="detail-row">
                <span class="detail-label">Property:</span>
                <span>${bookingDetails.propertyName}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Room:</span>
                <span>${bookingDetails.roomName}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Check-in:</span>
                <span>${new Date(bookingDetails.checkIn).toLocaleDateString()}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Check-out:</span>
                <span>${new Date(bookingDetails.checkOut).toLocaleDateString()}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Booking Reference:</span>
                <span>${bookingDetails.bookingId}</span>
              </div>
            </div>
            <p>If you have any questions about the cancellation or refund process, please contact us.</p>
          </div>
          <div class="footer">
            <p>Best regards,<br>The Reservario Team</p>
            <p><small>This is an automated message. Please do not reply to this email.</small></p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Booking Cancellation - ${bookingDetails.propertyName}
      
      Hello ${guestName}!
      
      Your booking has been cancelled as requested.
      
      Cancelled Booking Details:
      Property: ${bookingDetails.propertyName}
      Room: ${bookingDetails.roomName}
      Check-in: ${new Date(bookingDetails.checkIn).toLocaleDateString()}
      Check-out: ${new Date(bookingDetails.checkOut).toLocaleDateString()}
      Booking Reference: ${bookingDetails.bookingId}
      
      If you have any questions about the cancellation or refund process, please contact us.
      
      Best regards,
      The Reservario Team
      
      This is an automated message. Please do not reply to this email.
    `;

    return { subject, html, text };
  }

  private getNewBookingNotificationEmailTemplate(ownerName: string, bookingDetails: any): EmailTemplate {
    const subject = `New Booking - ${bookingDetails.propertyName}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>New Booking Notification</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f8fafc; }
          .footer { padding: 20px; text-align: center; color: #666; }
          .booking-details { background: white; padding: 20px; border-radius: 4px; margin: 15px 0; }
          .detail-row { display: flex; justify-content: space-between; margin: 10px 0; }
          .detail-label { font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Booking Received!</h1>
          </div>
          <div class="content">
            <h2>Hello ${ownerName}!</h2>
            <p>You have received a new booking for your property.</p>
            <div class="booking-details">
              <h3>Booking Details</h3>
              <div class="detail-row">
                <span class="detail-label">Property:</span>
                <span>${bookingDetails.propertyName}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Room:</span>
                <span>${bookingDetails.roomName}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Guest:</span>
                <span>${bookingDetails.guestName}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Check-in:</span>
                <span>${new Date(bookingDetails.checkIn).toLocaleDateString()}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Check-out:</span>
                <span>${new Date(bookingDetails.checkOut).toLocaleDateString()}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Total Amount:</span>
                <span>${bookingDetails.currency} ${bookingDetails.totalAmount}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Booking Reference:</span>
                <span>${bookingDetails.bookingId}</span>
              </div>
            </div>
            <p>Please log in to your dashboard to view more details and manage this booking.</p>
          </div>
          <div class="footer">
            <p>Best regards,<br>The Reservario Team</p>
            <p><small>This is an automated message. Please do not reply to this email.</small></p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      New Booking - ${bookingDetails.propertyName}
      
      Hello ${ownerName}!
      
      You have received a new booking for your property.
      
      Booking Details:
      Property: ${bookingDetails.propertyName}
      Room: ${bookingDetails.roomName}
      Guest: ${bookingDetails.guestName}
      Check-in: ${new Date(bookingDetails.checkIn).toLocaleDateString()}
      Check-out: ${new Date(bookingDetails.checkOut).toLocaleDateString()}
      Total Amount: ${bookingDetails.currency} ${bookingDetails.totalAmount}
      Booking Reference: ${bookingDetails.bookingId}
      
      Please log in to your dashboard to view more details and manage this booking.
      
      Best regards,
      The Reservario Team
      
      This is an automated message. Please do not reply to this email.
    `;

    return { subject, html, text };
  }

  private getSystemNotificationEmailTemplate(subject: string, message: string, priority: string): EmailTemplate {
    const priorityColors: Record<string, string> = {
      low: '#059669',
      medium: '#d97706',
      high: '#dc2626'
    };

    const priorityColor = priorityColors[priority] || priorityColors.medium;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>System Notification</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${priorityColor}; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f8fafc; }
          .footer { padding: 20px; text-align: center; color: #666; }
          .priority-badge { display: inline-block; padding: 4px 8px; background: ${priorityColor}; color: white; border-radius: 4px; font-size: 12px; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>System Notification</h1>
            <span class="priority-badge">${priority} Priority</span>
          </div>
          <div class="content">
            <h2>${subject}</h2>
            <p>${message}</p>
            <p>Please log in to your dashboard for more information.</p>
          </div>
          <div class="footer">
            <p>Best regards,<br>The Reservario Team</p>
            <p><small>This is an automated message. Please do not reply to this email.</small></p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      System Notification - ${priority.toUpperCase()} Priority
      
      ${subject}
      
      ${message}
      
      Please log in to your dashboard for more information.
      
      Best regards,
      The Reservario Team
      
      This is an automated message. Please do not reply to this email.
    `;

    return { subject: `[${priority.toUpperCase()}] ${subject}`, html, text };
  }

  // Check if email service is configured
  isEmailConfigured(): boolean {
    return this.isConfigured;
  }

  // Test email configuration
  async testEmailConfiguration(): Promise<boolean> {
    if (!this.isConfigured || !this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      logger.error('Email configuration test failed:', error);
      return false;
    }
  }
}

// Create singleton instance
const emailService = new EmailService();

export default emailService;
