const test = require('node:test')
const assert = require('node:assert/strict')
const {
  parseJourneyDate,
  normalizeStationCode,
  normalizeTrain,
  searchTrains,
} = require('../../src/server/trainSearch')

test('normalizes DD/MM/YYYY to ISO date', () => {
  assert.equal(parseJourneyDate('05/10/2026'), '2026-10-05')
})

test('rejects invalid station codes and invalid dates', () => {
  assert.throws(() => normalizeStationCode('Delhi Jn', 'from'), /valid station code/)
  assert.throws(() => parseJourneyDate('31/02/2026'), /invalid/)
})

test('normalizes and filters train data by requested class', async () => {
  const result = await searchTrains({
    from: 'NDLS',
    to: 'HWH',
    date: '05/10/2026',
    travelClass: '3A',
    fetchImpl: async url => {
      assert.match(String(url), /from=NDLS/)
      assert.match(String(url), /to=HWH/)
      assert.match(String(url), /date=2026-10-05/)
      return {
        ok: true,
        async json() {
          return {
            data: [
              {
                trainNumber: '12301',
                trainName: 'Howrah Rajdhani Express',
                departureTime: '16:50',
                arrivalTime: '09:55',
                availableClasses: ['1A', '2A', '3A'],
              },
              {
                trainNumber: '12951',
                trainName: 'Mumbai Rajdhani',
                departureTime: '17:00',
                arrivalTime: '08:35',
                availableClasses: ['1A', '2A'],
              },
            ],
          }
        },
      }
    },
  })

  assert.equal(result.trains.length, 1)
  assert.equal(result.trains[0].trainNumber, '12301')
})

test('returns cached results for the same route/date/class key', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return {
      ok: true,
      async json() {
        return { data: [{ trainNumber: '12301', trainName: 'Test', availableClasses: [] }] }
      },
    }
  }

  await searchTrains({
    from: 'NDLS',
    to: 'HWH',
    date: '06/10/2026',
    fetchImpl,
  })
  await searchTrains({
    from: 'NDLS',
    to: 'HWH',
    date: '06/10/2026',
    fetchImpl,
  })
  assert.equal(calls, 1)
})
