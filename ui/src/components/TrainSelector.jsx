import React, { useEffect, useState } from 'react'
import { Autocomplete, CircularProgress, TextField, Typography } from '@mui/material'
import dayjs from 'dayjs'

function toIsoDate(value) {
  if (!value) return ''
  if (dayjs.isDayjs(value)) return value.isValid() ? value.format('YYYY-MM-DD') : ''
  const parsed = dayjs(value, 'DD/MM/YYYY', true)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : ''
}

export default function TrainSelector({
  from,
  to,
  travelDate,
  travelClass,
  value,
  onChange,
  disabled = false,
}) {
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    const isoDate = toIsoDate(travelDate)

    if (!from || !to || !isoDate) {
      setOptions([])
      setLoaded(false)
      setErrorText('')
      return undefined
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      setErrorText('')
      setLoaded(false)
      try {
        const params = new URLSearchParams({
          from: String(from).toUpperCase(),
          to: String(to).toUpperCase(),
          date: isoDate,
        })
        if (travelClass) params.set('class', String(travelClass).toUpperCase())

        const response = await fetch('/api/trains?' + params.toString(), {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error || 'Train search failed')
        if (!active) return
        setOptions(Array.isArray(payload.trains) ? payload.trains : [])
        setLoaded(true)
      } catch (error) {
        if (!active || error.name === 'AbortError') return
        setOptions([])
        setErrorText(error.message || 'Train search unavailable')
        setLoaded(true)
      } finally {
        if (active) setLoading(false)
      }
    }, 250)

    return () => {
      active = false
      controller.abort()
      clearTimeout(timer)
    }
  }, [from, to, travelDate, travelClass])

  const selected = options.find(train => train.trainNumber === String(value || '')) || null

  return (
    <>
      <Autocomplete
        fullWidth
        options={options}
        value={selected}
        loading={loading}
        disabled={disabled}
        autoHighlight
        isOptionEqualToValue={(option, optionValue) => option.trainNumber === optionValue.trainNumber}
        getOptionLabel={option => option ? option.trainNumber + ' · ' + option.trainName : ''}
        noOptionsText={
          errorText ||
          (!from || !to ? 'Select From and To stations first' :
            !travelDate ? 'Select a journey date first' :
              loaded ? 'No trains found for this route/date/class' : 'Enter journey details to load trains')
        }
        loadingText="Loading trains…"
        onChange={(_, train) => onChange(train ? train.trainNumber : '')}
        filterOptions={items => items}
        renderOption={(props, train) => (
          <li {...props} key={train.trainNumber}>
            <div style={{ width: '100%' }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {train.trainNumber} · {train.trainName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {train.departureTime || '--:--'} → {train.arrivalTime || '--:--'}
                {train.duration ? ' · ' + train.duration : ''}
                {train.availableClasses.length ? ' · ' + train.availableClasses.join(', ') : ''}
              </Typography>
            </div>
          </li>
        )}
        renderInput={params => (
          <TextField
            {...params}
            label="Train"
            placeholder="Select train after choosing stations"
            helperText={
              errorText
                ? errorText + ' — you can still enter a train number manually below.'
                : 'Selecting a train switches Train Selection to Fixed Train.'
            }
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading ? <CircularProgress color="inherit" size={18} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
      />
    </>
  )
}
