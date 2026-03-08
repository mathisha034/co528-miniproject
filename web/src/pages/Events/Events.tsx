import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Users, Plus, X, Video } from 'lucide-react';
import { api } from '../../lib/axios';
import { useAuth } from '../../contexts/AuthContext';
import './Events.css';

interface Event {
    _id: string;
    title: string;
    description: string;
    date: string;
    location: string;
    format: 'in-person' | 'online' | 'hybrid';
    organizer: string;
    attendees: string[];
    maxAttendees?: number;
}

export const Events: React.FC = () => {
    const { user, hasRole } = useAuth();
    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(false);

    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        title: '', description: '', date: '', time: '', location: '', format: 'in-person'
    });

    const fetchEvents = async () => {
        try {
            setLoading(true);
            const res = await api.get('/api/v1/event-service/events');
            // Assume API returns { items: Event[] } or Event[]
            setEvents(res.data.items || res.data || []);
        } catch (err) {
            console.error('Failed to load events', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEvents();
    }, []);

    const handleRSVP = async (eventId: string, isAttending: boolean) => {
        try {
            const endpoint = isAttending ? `/api/v1/event-service/events/${eventId}/cancel` : `/api/v1/event-service/events/${eventId}/rsvp`;
            await api.post(endpoint);

            const userId = user?.sub || 'me';
            setEvents(prev => prev.map(ev => {
                if (ev._id === eventId) {
                    const newAttendees = isAttending
                        ? ev.attendees.filter(id => id !== userId)
                        : [...ev.attendees, userId];
                    return { ...ev, attendees: newAttendees };
                }
                return ev;
            }));
        } catch (err) {
            console.error('RSVP failed', err);
            alert('Failed to update RSVP status.');
        }
    };

    const handleCreateEvent = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // Combine date and time
            const dateTime = new Date(`${formData.date}T${formData.time}`).toISOString();
            const payload = {
                title: formData.title,
                description: formData.description,
                date: dateTime,
                location: formData.location,
                format: formData.format
            };

            const res = await api.post('/api/v1/event-service/events', payload);
            setEvents(prev => [...(prev || []), res.data]);
            setShowModal(false);
            setFormData({ title: '', description: '', date: '', time: '', location: '', format: 'in-person' });
        } catch (err) {
            console.error('Failed to create event', err);
            alert('Failed to create event.');
        }
    };

    const isAdmin = hasRole('admin');

    return (
        <div className="events-page">
            <div className="page-header">
                <div>
                    <h1>Upcoming Events</h1>
                    <p className="subtitle">Join seminars, workshops, and networking sessions.</p>
                </div>
                {isAdmin && (
                    <button className="primary-btn" onClick={() => setShowModal(true)}>
                        <Plus size={18} />
                        <span>Create Event</span>
                    </button>
                )}
            </div>

            <div className="events-list">
                {loading ? (
                    <div className="loading-state">Loading events...</div>
                ) : events.length > 0 ? (
                    events.map(event => {
                        const isAttending = event.attendees.includes(user?.sub || 'me');
                        const eventDate = new Date(event.date);
                        const month = eventDate.toLocaleString('default', { month: 'short' });
                        const day = eventDate.getDate();
                        const time = eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                        return (
                            <div key={event._id} className="event-card card">
                                <div className="event-date-block">
                                    <span className="event-month">{month}</span>
                                    <span className="event-day">{day}</span>
                                </div>

                                <div className="event-details">
                                    <div className="event-header-row">
                                        <h3 className="event-title">{event.title}</h3>
                                        <span className={`event-format-badge ${event.format}`}>
                                            {event.format === 'online' ? <Video size={14} /> : <MapPin size={14} />}
                                            {event.format.charAt(0).toUpperCase() + event.format.slice(1)}
                                        </span>
                                    </div>

                                    <div className="event-meta">
                                        <span className="meta-item"><Calendar size={16} /> {time}</span>
                                        <span className="meta-item"><MapPin size={16} /> {event.location}</span>
                                        <span className="meta-item"><Users size={16} /> {event.attendees.length} Attendees</span>
                                    </div>

                                    <p className="event-description">{event.description}</p>
                                </div>

                                <div className="event-actions">
                                    <button
                                        className={`rsvp-btn ${isAttending ? 'attending' : ''}`}
                                        onClick={() => handleRSVP(event._id, isAttending)}
                                    >
                                        {isAttending ? '✓ Going' : 'RSVP'}
                                    </button>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="empty-state card">
                        <Calendar size={48} className="empty-icon" />
                        <h3>No upcoming events</h3>
                        <p>Admin will schedule new events soon.</p>
                    </div>
                )}
            </div>

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content card">
                        <div className="modal-header">
                            <h2>Schedule a New Event</h2>
                            <button className="icon-btn" onClick={() => setShowModal(false)}><X size={24} /></button>
                        </div>
                        <form className="event-form" onSubmit={handleCreateEvent}>
                            <div className="form-group">
                                <label>Event Title</label>
                                <input required type="text" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Date</label>
                                    <input required type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Time</label>
                                    <input required type="time" value={formData.time} onChange={e => setFormData({ ...formData, time: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Format</label>
                                    <select value={formData.format} onChange={e => setFormData({ ...formData, format: e.target.value })}>
                                        <option value="in-person">In-Person</option>
                                        <option value="online">Online</option>
                                        <option value="hybrid">Hybrid</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Location / Link</label>
                                    <input required type="text" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <textarea required rows={4} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}></textarea>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="cancel-btn" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="primary-btn">Create Event</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
