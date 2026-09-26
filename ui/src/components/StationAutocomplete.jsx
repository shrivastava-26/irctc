import React, { useEffect, useMemo, useState } from 'react'
import { Autocomplete, CircularProgress, TextField } from '@mui/material'

let stationsPromise = null

function loadStations() {
  if (!stationsPromise) {
    stationsPromise = fetch('/stations.json', { cache: 'force-cache' })
      .then(response => {
        if (!response.ok) throw new Error('Station directory failed to load')
        return response.json()
      })
      .then(items => Array.isArray(items) ? items : [])
  }
  return stationsPromise
}

function rankStations(stations, query) {
  const needle = String(query || '').trim().toUpperCase()
  if (!needle) return []

  return stations
    .map(station => {
      const code = String(station.code || '').toUpperCase()
      const name = String(station.name || '').toUpperCase()
      let rank = 99
      if (code === needle) rank = 0
      else if (code.startsWith(needle)) rank = 1
      else if (name.startsWith(needle)) rank = 2
      else if (name.includes(needle)) rank = 3
      else if (code.includes(needle)) rank = 4
      return { station, rank }
    })
    .filter(item => item.rank < 99)
    .sort((a, b) => itemSort(a, b))
    .slice(0, 15)
    .map(item => item.station)
}

function itemSort(a, b) {
  return a.rank - b.rank ||
    String(a.station.name).localeCompare(String(b.station.name)) ||
    String(a.station.code).localeCompare(String(b.station.code))
}

export default function StationAutocomplete({
  value,
  onChange,
  label,
  error,
  helperText,
  disabled = false,
}) {
  const [stations, setStations] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    loadStations()
      .then(items => {
        if (!active) return
        setStations(items)
        const current = items.find(item => String(item.code).toUpperCase() === String(value || '').toUpperCase())
        if (current) setInputValue(current.name + ' (' + current.code + ')')
      })
      .catch(() => {
        if (active) setLoadError('Station directory unavailable')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [value])

  const selected = useMemo(
    () => stations.find(item => String(item.code).toUpperCase() === String(value || '').toUpperCase()) || null,
    [stations, value],
  )

  const options = useMemo(() => rankStations(stations, inputValue), [stations, inputValue])

  return (
    <Autocomplete
      fullWidth
      options={options}
      value={selected}
      inputValue={inputValue}
      loading={loading}
      disabled={disabled}
      autoHighlight
      isOptionEqualToValue={(option, optionValue) => option.code === optionValue.code}
      getOptionLabel={option => option ? option.name + ' (' + option.code + ')' : ''}
      noOptionsText={loadError || (inputValue ? 'No matching stations' : 'Type a station name or code')}
      loadingText="Loading stations…"
      onOpen={() => loadStations().catch(() => {})}
      onInputChange={(_, nextValue, reason) => {
        setInputValue(nextValue)
        if (reason === 'clear') onChange('')
      }}
      onChange={(_, nextOption) => {
        onChange(nextOption ? String(nextOption.code).toUpperCase() : '')
        setInputValue(nextOption ? nextOption.name + ' (' + nextOption.code + ')' : '')
      }}
      filterOptions={items => items}
      renderOption={(props, option) => (
        <li {...props} key={option.code}>
          <div style={{ width: '100%' }}>
            <strong>{option.name}</strong>
            <div style={{ opacity: 0.68, fontSize: 12 }}>{option.code}</div>
          </div>
        </li>
      )}
      renderInput={params => (
        <TextField
          {...params}
          label={label}
          error={Boolean(error)}
          helperText={helperText || loadError}
          placeholder="Type station name or code"
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
  )
}
