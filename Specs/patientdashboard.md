--Show the Patient dashboard with the patient data.
--In patient dashboard, sidemenu should have options Dashboard, Book Appointment, My Appointments, Medical records, Billing and Payments, Profile and Settings and Logout option.
## Book an appointment
-- When Clicked on 'Book an Appointment' button , first display the list of doctors in the cards with their Available days for each doctor and show the consultation fee different for the each department. And for emergeny show other ammount and Add 'Book' button.
-- When clicked on 'Book' button Open a form as pop-up with fields Appointment type with options Regular, Emergency. Select date and Available slots and Reason for visit as optional filling.
--After clicking Book Appointment go to the Billing option with adding GST amount and make dummy payment.
-- When cancel appointment instead of alert show pop-up Like ' Do you want to cancel appointment with the doctor' like that.
-- When cancel appointment, In the pop-up also show that if patient status is confirmed then also add message ' No refund will be provided'. When Status is pending then show message ' you will be refunded for your payment' and refund the payment after cancelling appointment.

## My Appointments
-- When clicked on My Appointments, it should show the grid of all the appointments. It should not scrolling in the dashboard page. It should be like /dashboard?view=myappointments

## Medical Records.
-- Show the list of medical records for the patient that suggested by the doctor.
-- Patient can download prescriptions and lab reports also.
-- Patient also can be able to upload his lab reports.
-- When doctor suggests some lab tests, then allow patient can upload his lab report.

## Billing and Payments
-- It should show the Billing list for which doctor he payed the fees and payment status like Success or failed.
-- Patient can download the invoice of the billing.

## Profile and Settings.
-- Show the patient user data saved in the database so that the patient can update his personal data .