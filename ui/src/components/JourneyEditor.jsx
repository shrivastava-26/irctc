import React, { useState } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, Checkbox, FormControl,
  FormControlLabel, FormHelperText, Grid, IconButton, InputLabel, MenuItem, Paper,
  Radio, RadioGroup, Select, Stack, TextField, Typography
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import dayjs from 'dayjs'
import StationAutocomplete from './StationAutocomplete'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(customParseFormat)

const CLASSES = ['1A', '2A', '3A', '3E', 'CC', 'SL', '2S', 'FC']
const QUOTAS = [
  { value: 'GENERAL', label: 'GENERAL' },
  { value: 'TATKAL', label: 'TATKAL' },
  { value: 'PREMIUM_TATKAL', label: 'PREMIUM TATKAL' },
]

function normalizeTrainNumber(value) {
  return String(value || '').trim().replace(/\s+/g, '')
}

function legacySelectedTrains(data) {
  if (Array.isArray(data?.selectedTrains)) return data.selectedTrains

  const fixed = String(data?.trainSelectionPolicy || '').toUpperCase() === 'FIXED'
  const values = fixed && data?.trainNumber
    ? [String(data.trainNumber)]
    : [
        ...(data?.trainNumber ? [String(data.trainNumber)] : []),
        ...(Array.isArray(data?.preferredTrains) ? data.preferredTrains : []),
        ...(Array.isArray(data?.backupTrains) ? data.backupTrains : []),
      ]

  const seen = new Set()
  return values
    .map(normalizeTrainNumber)
    .filter(value => /^\d{5}$/.test(value) && !seen.has(value) && (seen.add(value), true))
    .map((trainNumber, index) => ({
      trainNumber,
      priority: index + 1,
      selected: true,
      trainName: null,
    }))
}

export default function JourneyEditor({
  initialData,
  onSave,
  onCancel,
  accountUsername = '',
  onSecurePaymentCredential,
}) {
  const legacyAutomaticMode = Boolean(
    initialData &&
    !Array.isArray(initialData.selectedTrains) &&
    !initialData.trainNumber &&
    !(initialData.preferredTrains || []).length &&
    !(initialData.backupTrains || []).length,
  )

  const defaultVals = initialData
    ? Object.assign({}, initialData, {
        travelDate: initialData.travelDate
          ? dayjs(initialData.travelDate, 'DD/MM/YYYY')
          : null,
        manualTrainNumber: initialData.trainNumber || '',
        selectedTrains: legacySelectedTrains(initialData),
        useMasterPassenger: Boolean(initialData.useMasterPassenger),
        paymentMethod: initialData.paymentPreference?.method || 'UPI',
        upiId: initialData.paymentPreference?.upiId || initialData.upiId || '',
        ewalletTransactionPassword: '',
      })
    : {
        source: '',
        destination: '',
        entrySurface: 'AUTO',
        travelDate: null,
        quota: 'GENERAL',
        trainNumber: '',
        manualTrainNumber: '',
        trainSelectionPolicy: 'FIRST_VALID',
        preferredTrains: [],
        backupTrains: [],
        selectedTrains: [],
        availabilityRequirement: 'AVAILABLE',
        coach: '3A',
        boardingStation: '',
        passengers: [{
          name: '',
          age: '',
          gender: 'Male',
          berth: 'No Preference',
          food: 'No Food',
        }],
        useMasterPassenger: false,
        paymentMethod: 'UPI',
        upiId: '',
        ewalletTransactionPassword: '',
        executionMode: 'NOW',
        isMock: false,
      }

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm({ defaultValues: defaultVals })

  const { fields: passengers, append, remove } = useFieldArray({
    control,
    name: 'passengers',
  })

  const {
    fields: trainFields,
    append: appendTrain,
    remove: removeTrain,
    move: moveTrain,
  } = useFieldArray({
    control,
    name: 'selectedTrains',
  })

  const [newTrainNumber, setNewTrainNumber] = useState('')
  const [saveError, setSaveError] = useState('')

  const selectedTrains = watch('selectedTrains') || []
  const selectedCount = selectedTrains.filter(item => item?.selected !== false).length
  const paymentMethod = String(watch('paymentMethod') || 'UPI').toUpperCase()

  const addTrain = () => {
    const number = normalizeTrainNumber(newTrainNumber)
    if (!/^\d{5}$/.test(number)) {
      setSaveError('Train number must be exactly 5 digits.')
      return
    }
    if (selectedTrains.some(item => normalizeTrainNumber(item?.trainNumber) === number)) {
      setSaveError('Train ' + number + ' is already in the list.')
      return
    }
    appendTrain({ trainNumber: number, priority: trainFields.length + 1, selected: true, trainName: '' })
    setNewTrainNumber('')
    setSaveError('')
  }

  const toggleSelected = (index, checked) => {
    setValue('selectedTrains.' + index + '.selected', checked, { shouldDirty: true })
  }

  const swapStations = () => {
    const from = watch('source')
    const to = watch('destination')
    setValue('source', to)
    setValue('destination', from)
  }

  const submitHandler = async (data) => {
    setSaveError('')

    const csv = value => {
      if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean)
      return String(value || '').split(',').map(v => v.trim()).filter(Boolean)
    }

    const trains = (data.selectedTrains || []).map((entry, index) => ({
      trainNumber: normalizeTrainNumber(entry?.trainNumber),
      priority: index + 1,
      selected: entry?.selected !== false,
      trainName: entry?.trainName ? String(entry.trainName).trim() : null,
    }))

    const seen = new Set()
    for (const entry of trains) {
      if (!/^\d{5}$/.test(entry.trainNumber)) {
        setSaveError('Every train number must be exactly 5 digits.')
        return
      }
      if (seen.has(entry.trainNumber)) {
        setSaveError('Duplicate train number: ' + entry.trainNumber)
        return
      }
      seen.add(entry.trainNumber)
    }

    const selected = trains.filter(entry => entry.selected)
    if (!selected.length && !legacyAutomaticMode) {
      setSaveError('Select at least one train.')
      return
    }

    const method = String(data.paymentMethod || 'UPI').toUpperCase()
    if (method === 'UPI' && !String(data.upiId || '').trim()) {
      setSaveError('UPI ID is required for UPI payment.')
      return
    }

    if (method === 'EWALLET' && data.ewalletTransactionPassword) {
      if (!String(accountUsername || '').trim()) {
        setSaveError('Select an IRCTC account before storing the eWallet transaction password.')
        return
      }
      if (typeof onSecurePaymentCredential !== 'function') {
        setSaveError('Secure eWallet credential storage is unavailable.')
        return
      }
      try {
        await onSecurePaymentCredential(String(accountUsername).trim(), String(data.ewalletTransactionPassword))
      } catch (error) {
        setSaveError(error.message || 'Could not store the eWallet credential.')
        return
      }
    }

    const payload = Object.assign({}, data, {
      travelDate: data.travelDate ? dayjs(data.travelDate).format('DD/MM/YYYY') : '',
      entrySurface: String(data.entrySurface || 'AUTO').toUpperCase(),
      trainSelectionPolicy: selected.length
        ? 'FIRST_VALID'
        : String(data.trainSelectionPolicy || 'FIRST_VALID').toUpperCase(),
      preferredTrains: csv(data.preferredTrains),
      backupTrains: csv(data.backupTrains),
      selectedTrains: selected.length ? trains : undefined,
      trainNumber: selected.length === 1
        ? selected[0].trainNumber
        : (initialData?.trainNumber || ''),
      paymentPreference: {
        method,
        upiId: method === 'UPI' ? String(data.upiId || '').trim() : '',
        ewallet: {
          transactionPasswordReference:
            method === 'EWALLET' && data.ewalletTransactionPassword
              ? 'session'
              : (initialData?.paymentPreference?.ewallet?.transactionPasswordReference || null),
        },
      },
      useMasterPassenger: Boolean(data.useMasterPassenger),
      id: initialData && initialData.id ? initialData.id : Date.now().toString(),
    })

    delete payload.paymentMethod
    delete payload.ewalletTransactionPassword
    if (!selected.length && legacyAutomaticMode) delete payload.selectedTrains

    onSave(payload)
  }

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, minWidth: 0 }}>
      <Typography variant="h6" color="primary" sx={{ mb: 2, fontWeight: 'bold', fontSize: { xs: '1rem', sm: '1.1rem' } }}>
        {initialData ? 'EDIT JOURNEY' : 'NEW JOURNEY'}
      </Typography>

      <form onSubmit={handleSubmit(submitHandler)}>
        <Grid container spacing={{ xs: 1.25, sm: 2 }} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={3}>
            <Controller name="source" control={control} rules={{ required: 'Required' }} render={({ field }) => (
              <StationAutocomplete
                value={field.value}
                onChange={field.onChange}
                label="From"
                error={errors.source}
              />
            )} />
          </Grid>
          <Grid item xs={12} sm={1} sx={{ display: 'flex', justifyContent: { xs: 'flex-start', sm: 'center' } }}>
            <IconButton onClick={swapStations} color="primary" size="small" aria-label="Swap stations">
              <SwapHorizIcon />
            </IconButton>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Controller name="destination" control={control} rules={{ required: 'Required' }} render={({ field }) => (
              <StationAutocomplete
                value={field.value}
                onChange={field.onChange}
                label="To"
                error={errors.destination}
              />
            )} />
          </Grid>
          <Grid item xs={12} sm={5}>
            <Controller name="travelDate" control={control} rules={{ required: 'Required' }} render={({ field }) => (
              <DatePicker
                {...field}
                label="Journey Date"
                format="DD/MM/YYYY"
                slotProps={{ textField: { fullWidth: true, error: !!errors.travelDate } }}
              />
            )} />
          </Grid>

          <Grid item xs={12} sm={6}>
            <Controller name="entrySurface" control={control} render={({ field }) => (
              <FormControl fullWidth>
                <InputLabel>IRCTC Website</InputLabel>
                <Select {...field} label="IRCTC Website">
                  <MenuItem value="AUTO">Auto — detect runtime</MenuItem>
                  <MenuItem value="NEW">New IRCTC — /eticket/</MenuItem>
                  <MenuItem value="LEGACY">Legacy IRCTC — /nget/train-search</MenuItem>
                </Select>
              </FormControl>
            )} />
          </Grid>

          <Grid item xs={12}>
            <Accordion variant="outlined" disableGutters sx={{ mb: 1 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 1 } }}>
                <Typography variant="body2" fontWeight="bold">Train Selection</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: { xs: 1, sm: 2 }, py: { xs: 1, sm: 2 } }}>
                <Stack spacing={1}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <TextField
                      value={newTrainNumber}
                      onChange={event => {
                        setNewTrainNumber(event.target.value.replace(/\D/g, '').slice(0, 5))
                        if (saveError) setSaveError('')
                      }}
                      label="Add Train Number"
                      placeholder="5-digit train number"
                      inputProps={{ maxLength: 5, inputMode: 'numeric' }}
                      sx={{ flex: 1, minWidth: 220 }}
                    />
                    <Button variant="outlined" startIcon={<AddIcon />} onClick={addTrain} sx={{ minHeight: 40 }}>
                      Add Train
                    </Button>
                  </Box>

                  {trainFields.length === 0 && (
                    <Paper variant="outlined" sx={{ p: 1.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        No explicit trains configured. Existing automatic journeys keep their previous selection behavior.
                      </Typography>
                    </Paper>
                  )}

                  {trainFields.map((field, index) => (
                    <Paper key={field.id} variant="outlined" sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                      <Controller
                        name={'selectedTrains.' + index + '.selected'}
                        control={control}
                        render={({ field: selectedField }) => (
                          <Checkbox
                            checked={selectedField.value !== false}
                            onChange={event => toggleSelected(index, event.target.checked)}
                            inputProps={{ 'aria-label': 'Select priority ' + (index + 1) }}
                          />
                        )}
                      />
                      <Box sx={{ minWidth: 72 }}>
                        <Typography variant="caption" color="text.secondary">Priority</Typography>
                        <Typography variant="body2" fontWeight="bold">{index + 1}</Typography>
                      </Box>
                      <Controller
                        name={'selectedTrains.' + index + '.trainNumber'}
                        control={control}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            fullWidth
                            label="Train Number"
                            inputProps={{ maxLength: 5, inputMode: 'numeric' }}
                            onChange={event => field.onChange(event.target.value.replace(/\D/g, '').slice(0, 5))}
                          />
                        )}
                      />
                      <IconButton size="small" onClick={() => moveTrain(index, index - 1)} disabled={index === 0} aria-label="Move train up">
                        <ArrowUpwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => moveTrain(index, index + 1)} disabled={index === trainFields.length - 1} aria-label="Move train down">
                        <ArrowDownwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => removeTrain(index)} aria-label="Remove train">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Paper>
                  ))}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Only checked trains participate. {selectedCount === 1
                    ? 'This train is mandatory.'
                    : selectedCount > 1
                      ? 'Trains will be tried in priority order. The first available selected train will be booked.'
                      : 'Select at least one train.'}
                </Typography>
              </AccordionDetails>
            </Accordion>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Controller name="boardingStation" control={control} render={({ field }) => (
              <TextField {...field} label="Boarding (Opt)" fullWidth />
            )} />
          </Grid>
        </Grid>

        <Accordion variant="outlined" disableGutters sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 1 } }}>
            <Typography variant="body2" fontWeight="bold">Passengers ({passengers.length})</Typography>
          </AccordionSummary>

          <AccordionDetails sx={{ px: { xs: 1, sm: 2 }, py: { xs: 1, sm: 2 } }}>
            <Controller
              name="useMasterPassenger"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Checkbox {...field} checked={Boolean(field.value)} />}
                  label="Use IRCTC Master Passenger"
                />
              )}
            />
            <Stack spacing={1}>
              {passengers.map((passenger, index) => (
                <Paper key={passenger.id} variant="outlined" sx={{ p: { xs: 1, sm: 1.25 }, minWidth: 0 }}>
                  <Grid container spacing={1} alignItems="center">
                    <Grid item xs={12} sm={5}>
                      <Controller
                        name={'passengers.' + index + '.name'}
                        control={control}
                        rules={{ required: true }}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            label="Name"
                            fullWidth
                            error={!!errors.passengers?.[index]?.name}
                          />
                        )}
                      />
                    </Grid>

                    <Grid item xs={4} sm={2}>
                      <Controller
                        name={'passengers.' + index + '.age'}
                        control={control}
                        rules={{ required: true }}
                        render={({ field }) => <TextField {...field} label="Age" type="number" fullWidth />}
                      />
                    </Grid>

                    <Grid item xs={8} sm={2}>
                      <Controller
                        name={'passengers.' + index + '.gender'}
                        control={control}
                        render={({ field }) => (
                          <FormControl fullWidth>
                            <InputLabel>Gender</InputLabel>
                            <Select {...field} label="Gender">
                              <MenuItem value="Male">Male</MenuItem>
                              <MenuItem value="Female">Female</MenuItem>
                              <MenuItem value="Transgender">Transgender</MenuItem>
                            </Select>
                          </FormControl>
                        )}
                      />
                    </Grid>

                    <Grid item xs={10} sm={2}>
                      <Controller
                        name={'passengers.' + index + '.berth'}
                        control={control}
                        render={({ field }) => (
                          <FormControl fullWidth>
                            <InputLabel>Berth</InputLabel>
                            <Select {...field} label="Berth">
                              <MenuItem value="No Preference">No Preference</MenuItem>
                              <MenuItem value="Lower">Lower</MenuItem>
                              <MenuItem value="Middle">Middle</MenuItem>
                              <MenuItem value="Upper">Upper</MenuItem>
                              <MenuItem value="Side Lower">Side Lower</MenuItem>
                              <MenuItem value="Side Upper">Side Upper</MenuItem>
                            </Select>
                          </FormControl>
                        )}
                      />
                    </Grid>

                    <Grid item xs={2} sm={1} sx={{ display: 'flex', justifyContent: 'center' }}>
                      {passengers.length > 1 && (
                        <IconButton size="small" color="error" onClick={() => remove(index)} aria-label="Remove passenger">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Grid>
                  </Grid>
                </Paper>
              ))}
            </Stack>

            <Button
              startIcon={<AddIcon />}
              onClick={() => append({
                name: '',
                age: '',
                gender: 'Male',
                berth: 'No Preference',
                food: 'No Food',
              })}
              size="small"
              sx={{ mt: 1, width: { xs: '100%', sm: 'auto' } }}
            >
              Add Passenger
            </Button>
          </AccordionDetails>
        </Accordion>

        <Accordion variant="outlined" disableGutters sx={{ mb: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 1 } }}>
            <Typography variant="body2" fontWeight="bold">Payment & Options</Typography>
          </AccordionSummary>

          <AccordionDetails sx={{ px: { xs: 1, sm: 2 }, py: { xs: 1, sm: 2 } }}>
            <Grid container spacing={{ xs: 1.25, sm: 2 }}>
              <Grid item xs={12}>
                <Controller
                  name="paymentMethod"
                  control={control}
                  render={({ field }) => (
                    <FormControl>
                      <Typography variant="caption" fontWeight="bold">Payment Method</Typography>
                      <RadioGroup
                        {...field}
                        row
                        onChange={event => field.onChange(event.target.value)}
                      >
                        <FormControlLabel value="UPI" control={<Radio size="small" />} label="UPI" />
                        <FormControlLabel value="EWALLET" control={<Radio size="small" />} label="IRCTC eWallet" />
                      </RadioGroup>
                    </FormControl>
                  )}
                />
              </Grid>

              {paymentMethod === 'UPI' && (
                <Grid item xs={12} sm={6}>
                  <Controller
                    name="upiId"
                    control={control}
                    rules={{
                      required: 'UPI ID required',
                      pattern: /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.]+$/,
                    }}
                    render={({ field }) => (
                      <TextField {...field} label="UPI ID" fullWidth error={!!errors.upiId} />
                    )}
                  />
                </Grid>
              )}

              {paymentMethod === 'EWALLET' && (
                <Grid item xs={12} sm={6}>
                  <Controller
                    name="ewalletTransactionPassword"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="IRCTC eWallet transaction password"
                        type="password"
                        fullWidth
                        helperText="Only needed when the current IRCTC payment flow asks for it. Stored in the active server session only."
                      />
                    )}
                  />
                </Grid>
              )}

              <Grid item xs={12} sm={6}>
                <Controller
                  name="executionMode"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth>
                      <InputLabel>Mode</InputLabel>
                      <Select {...field} label="Mode">
                        <MenuItem value="NOW">Run Now</MenuItem>
                        <MenuItem value="SCHEDULED">Schedule for Later</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {saveError && (
          <FormHelperText error sx={{ mb: 1 }}>{saveError}</FormHelperText>
        )}

        <Box sx={{
          display: 'flex',
          gap: 1,
          justifyContent: { xs: 'stretch', sm: 'flex-end' },
          flexWrap: 'wrap',
        }}>
          <Button variant="outlined" onClick={onCancel} sx={{ flex: { xs: 1, sm: 'none' }, minWidth: 110 }}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" color="secondary" sx={{ flex: { xs: 1, sm: 'none' }, minWidth: 110 }}>
            Save Journey
          </Button>
        </Box>
      </form>
    </Box>
  )
}
