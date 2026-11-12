import { BookingService } from './booking.service';
import { Booking } from '../database/entities/booking.entity';
import { Service } from '../database/entities/service.entity';

describe('booking retry', () => {
  it('returns the original appointment before rechecking its occupied slot', async () => {
    const serviceId = '12345678-1234-1234-1234-123456789abc';
    const booking = {
      id: 'booking-1',
      customerName: 'Original Customer',
      startsAt: new Date('2030-01-01T10:00:00Z'),
    };
    const bookingRepo = { findOne: jest.fn().mockResolvedValue(booking) };
    const ds = {
      query: jest.fn().mockResolvedValue([{ timezone: 'UTC' }]),
      getRepository: (entity: unknown) =>
        entity === Booking
          ? bookingRepo
          : {
              findOne: jest
                .fn()
                .mockResolvedValue(
                  entity === Service
                    ? {
                        id: serviceId,
                        name: 'Consultation',
                        durationMinutes: 30,
                      }
                    : null,
                ),
            },
      transaction: jest.fn(),
    };
    const availability = { getFreeSlots: jest.fn().mockResolvedValue([]) };
    const queue = { add: jest.fn() };
    const result = await new BookingService(
      ds as any,
      availability as any,
      queue as any,
    ).bookAppointment({ tenantId: 'tenant-1', callId: 'call-1' } as any, {
      service_id: serviceId,
      start: booking.startsAt.toISOString(),
      customer_name: 'Retry Customer',
      customer_phone: '+923001234567',
    });
    expect(result).toMatchObject({
      booked: true,
      booking_id: 'booking-1',
      customer_name: 'Original Customer',
    });
    expect(bookingRepo.findOne).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        callId: 'call-1',
        serviceId,
        startsAt: booking.startsAt,
        status: 'confirmed',
      },
    });
    expect(availability.getFreeSlots).not.toHaveBeenCalled();
    expect(ds.transaction).not.toHaveBeenCalled();
  });
});
