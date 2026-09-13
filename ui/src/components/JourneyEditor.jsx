import React from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import {
  Box, Typography, TextField, MenuItem, Button, Grid, IconButton, Select, InputLabel, FormControl, Paper, Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
dayjs.extend(customParseFormat);

const CLASSES = ['1A', '2A', '3A', '3E', 'CC', 'SL', '2S', 'FC'];
const QUOTAS = [
  { value: 'GENERAL', label: 'GENERAL' },
  { value: 'TATKAL', label: 'TATKAL' },
  { value: 'PREMIUM_TATKAL', label: 'PREMIUM TATKAL' }
];

export default function JourneyEditor({ initialData, onSave, onCancel }) {
  const defaultVals = initialData ? {
    ...initialData,
    travelDate: initialData.travelDate ? dayjs(initialData.travelDate, 'DD/MM/YYYY') : null
  } : {
    source: '',
    destination: '',
    travelDate: null,
    quota: 'GENERAL',
    trainNumber: '',
    coach: '3A',
    boardingStation: '',
    passengers: [{ name: '', age: '', gender: 'Male', berth: 'No Preference', food: 'No Food' }],
    upiId: '',
    executionMode: 'NOW',
    isMock: false
  };

  const { control, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: defaultVals
  });

  const { fields: passengers, append, remove } = useFieldArray({ control, name: "passengers" });

  const swapStations = () => {
    const from = watch('source');
    const to = watch('destination');
    setValue('source', to);
    setValue('destination', from);
  };

  const submitHandler = (data) => {
    const formattedData = {
      ...data,
      travelDate: data.travelDate ? dayjs(data.travelDate).format('DD/MM/YYYY') : '',
      id: initialData?.id || Date.now().toString()
    };
    onSave(formattedData);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" color="primary" sx={{ mb: 2, fontWeight: 'bold', fontSize: '1.1rem' }}>
        {initialData ? 'EDIT JOURNEY' : 'NEW JOURNEY'}
      </Typography>
      
      <form onSubmit={handleSubmit(submitHandler)}>
        <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <Grid item xs={12} sm={3}>
            <Controller name="source" control={control} rules={{ required: 'Required' }} render={({ field }) => (
              <TextField {...field} label="From" fullWidth error={!!errors.source} placeholder="NDLS" size="small" />
            )} />
          </Grid>
          <Grid item xs={12} sm={1} sx={{ textAlign: 'center' }}>
            <IconButton onClick={swapStations} color="primary" size="small">
              <SwapHorizIcon />
            </IconButton>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Controller name="destination" control={control} rules={{ required: 'Required' }} render={({ field }) => (
              <TextField {...field} label="To" fullWidth error={!!errors.destination} placeholder="MMCT" size="small" />
            )} />
          </Grid>
          <Grid item xs={12} sm={5}>
            <Controller name="travelDate" control={control} rules={{ required: 'Required' }} render={({ field }) => (
              <DatePicker 
                {...field} 
                label="Journey Date" 
                format="DD/MM/YYYY"
                slotProps={{ textField: { fullWidth: true, size: 'small', error: !!errors.travelDate } }} 
              />
            )} />
          </Grid>
          
          <Grid item xs={12} sm={3}>
            <Controller name="trainNumber" control={control} rules={{ required: 'Required' }} render={({ field }) => (
              <TextField {...field} label="Train No" fullWidth error={!!errors.trainNumber} placeholder="12952" size="small" />
            )} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <Controller name="coach" control={control} render={({ field }) => (
              <FormControl fullWidth size="small">
                <InputLabel>Class</InputLabel>
                <Select {...field} label="Class">
                  {CLASSES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>
            )} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <Controller name="quota" control={control} render={({ field }) => (
              <FormControl fullWidth size="small">
                <InputLabel>Quota</InputLabel>
                <Select {...field} label="Quota">
                  {QUOTAS.map(q => <MenuItem key={q.value} value={q.value}>{q.label}</MenuItem>)}
                </Select>
              </FormControl>
            )} />
          </Grid>
          <Grid item xs={12} sm={3}>
             <Controller name="boardingStation" control={control} render={({ field }) => (
                <TextField {...field} label="Boarding (Opt)" fullWidth size="small" />
             )} />
          </Grid>
        </Grid>

        <Accordion variant="outlined" disableGutters sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: '40px', '& .MuiAccordionSummary-content': { my: 1 } }}>
            <Typography variant="body2" fontWeight="bold">Passengers ({passengers.length})</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {passengers.map((p, index) => (
              <Box key={p.id} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                <Controller name={`passengers.${index}.name`} control={control} rules={{ required: true }} render={({ field }) => (
                  <TextField {...field} label="Name" size="small" sx={{ flexGrow: 1 }} error={!!errors.passengers?.[index]?.name} />
                )} />
                <Controller name={`passengers.${index}.age`} control={control} rules={{ required: true }} render={({ field }) => (
                  <TextField {...field} label="Age" type="number" size="small" sx={{ width: 70 }} />
                )} />
                <Controller name={`passengers.${index}.gender`} control={control} render={({ field }) => (
                  <Select {...field} size="small" sx={{ width: 100 }}>
                    <MenuItem value="Male">M</MenuItem>
                    <MenuItem value="Female">F</MenuItem>
                    <MenuItem value="Transgender">T</MenuItem>
                  </Select>
                )} />
                <Controller name={`passengers.${index}.berth`} control={control} render={({ field }) => (
                  <Select {...field} size="small" sx={{ width: 130 }}>
                    <MenuItem value="No Preference">No Pref</MenuItem>
                    <MenuItem value="Lower">Lower</MenuItem>
                    <MenuItem value="Middle">Middle</MenuItem>
                    <MenuItem value="Upper">Upper</MenuItem>
                    <MenuItem value="Side Lower">SL</MenuItem>
                    <MenuItem value="Side Upper">SU</MenuItem>
                  </Select>
                )} />
                {passengers.length > 1 && (
                  <IconButton size="small" color="error" onClick={() => remove(index)}><DeleteIcon fontSize="small"/></IconButton>
                )}
              </Box>
            ))}
            <Button startIcon={<AddIcon />} onClick={() => append({ name: '', age: '', gender: 'Male', berth: 'No Preference', food: 'No Food' })} size="small" sx={{ mt: 1 }}>
              Add Passenger
            </Button>
          </AccordionDetails>
        </Accordion>

        <Accordion variant="outlined" disableGutters sx={{ mb: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: '40px', '& .MuiAccordionSummary-content': { my: 1 } }}>
            <Typography variant="body2" fontWeight="bold">Payment & Options</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Controller name="upiId" control={control} rules={{ required: 'UPI ID required', pattern: /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.]+$/ }} render={({ field }) => (
                  <TextField {...field} label="UPI ID" fullWidth size="small" error={!!errors.upiId} />
                )} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Controller name="executionMode" control={control} render={({ field }) => (
                  <FormControl fullWidth size="small">
                    <InputLabel>Mode</InputLabel>
                    <Select {...field} label="Mode">
                      <MenuItem value="NOW">Run Now</MenuItem>
                      <MenuItem value="SCHEDULED">Schedule for Later</MenuItem>
                    </Select>
                  </FormControl>
                )} />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
          <Button variant="outlined" onClick={onCancel} size="small">Cancel</Button>
          <Button type="submit" variant="contained" color="secondary" size="small">Save Journey</Button>
        </Box>
      </form>
    </Box>
  );
}
