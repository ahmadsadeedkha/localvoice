import { AdminInvoicesController } from './admin-invoices.controller';

it('rejects non-letter currencies and normalizes valid currencies at the API boundary', async () => {
  const invoices = {
    setPrice: jest.fn().mockResolvedValue({
      status: 'open',
      dueAt: new Date(),
      pricePerCredit: 1,
      amount: 1,
      currency: 'USD',
    }),
  };
  const controller = new AdminInvoicesController(invoices as any, {} as any);
  const principal = { userId: 'admin' } as any;
  await expect(
    controller.setPrice(
      'invoice-1',
      { pricePerCredit: 1, currency: '123' },
      principal,
    ),
  ).rejects.toThrow();
  await controller.setPrice(
    'invoice-1',
    { pricePerCredit: 1, currency: 'usd' },
    principal,
  );
  expect(invoices.setPrice).toHaveBeenCalledWith('invoice-1', 1, 'USD');
});
