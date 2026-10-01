import Contact from '../models/Contact.js';
import { validators, getClientIp } from '../utils/index.js';
import { sendContactNotification } from '../services/email.js';
import { logActivity } from '../services/activityLog.js';

export async function submitContact(req, res, next) {
  try {
    const { name, email, subject, message } = req.body || {};
    const v = validators();
    if (!name || !v.email(email) || !subject || !message) {
      return res.status(400).json({ error: 'Please fill in all fields with valid values.' });
    }

    const contact = await Contact.create({
      name: String(name).slice(0, 100),
      email: email.toLowerCase(),
      subject: String(subject).slice(0, 150),
      message: String(message).slice(0, 5000),
      ip_address: getClientIp(req),
    });

    await sendContactNotification(contact.email, contact.name, contact.subject, contact.message);
    await logActivity({ action: 'CONTACT', description: `Contact message from ${contact.name}`, entity_type: 'Contact', entity_id: contact._id, req });

    return res.status(201).json({ message: 'Thank you! Your message has been sent.' });
  } catch (err) {
    next(err);
  }
}
