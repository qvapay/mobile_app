# Requerimentos funcionales

## OnBoarding Pages

### OnBoarding usecases

Si el usuario va a usar la app por primera vez, mostrar un onBoarding page el cual consta de 3 paginas. Una vez mostrado, no se debe mostrar mas. Hint (Usar shared Preferences o cualquier otra db de llave valor para guardar esto). De aqui saldrian 2 usecases:

```dart
/// Returns Right(true) in case user has opened the app and finished the onBoarding Process. Returns Left(CacheFailure) in case it's the first time user opens the app or user manually deleted the cache storage.
Future<Either<Failure,bool>> isFirstTime(); 

/// Marks the onBoarding flag as true to [isFirstTime] method could consume it.
Future<Either<Failure,Unit>> markOnBoarding();
```

### OnBoarding UI

En cuanto a UI, se podria hacer de 2 formas : 3 paginas diferentes que se vayan cambiando, o una sola pagina con un carrousel en el centro cambiando solamente la imagen. Creo que cualquiera de las 2 puede quedar en talla, a decision de los clientes en caso de definir una preferencia.

## Authentication

Aqui manejaremos todo lo que tiene q ver con la autenticacion de un usuario. No confundir con "Mi Perfil", este sera otro feature totalmente separado de este. Aqui saber que siempre tendremos un Failure de tipo ExpiredCredentialsFailure(nombre provisional), que no lo manejaremos especificamente dentro pero si estara muy ligado al concepto de autenticacion. Backend en cualquier momento nos pedira una re-confirmacion del usuario, que se reflejara a nivel de dominio con la clase ExpiredCredentialsFailure. Al recibir este failure, UI se encargara de mostrar un re-login con data autorellenada para confirmar nuestra identidad. 

### Authentication usecases

En cuanto al servicio de autenticacion, encontramos 7 usecases:

```dart
/// Returns Right(unit) in case code was sent. Returns a Left(Failure) if an error was detected in the operation. In here we validate that email is in correct format, and also password. If there is some bad format, it will return specific failures for each case.
Future<Either<Failure,Unit>> loginFirstFactor(String email, String password); 

/// Server will return <accessToken,refreshToken> that will be safely stored in a key-value database. If the store transaction runs properly, then will return Right(unit), else, will return Left(CacheFailure). If server response is 403, return Left(InvalidCodeFailure) telling the user code sent was not valid. If server response is greater than 500, will return Left(ServerFailure())
Future<Either<Failure,Unit>> loginSecondFactor(String code);

/// Actives second factor authentication for my account.
Future<Either<Failure,Unit>> activateSecondFactor();


/// Return Right(unit) in case server registered user. In any other response, will return Left(ServerFailure) unless client want's to show different messages for specific failures. Will return 
Future<Either<Failure,Unit>> register(RegisterUserFields userFields);

/// Returns Right(unit) in case everything works properly. If phone is not properly formatted, will return Left(InvalidPhoneFormatFailure()). 
Future<Either<Failure,Unit>> sendCodeToPhone(String phone);

/// Returns Right(unit) in case everything works properly. If code is not properly formatted, will return Left(InvalidCodeFormatFailure()). 
Future<Either<Failure,Unit>> validateCode(String code); 

/// Returns Right(unit) in case everything works properly. If email is not properly formatted, will return Left(InvalidEmailFormatFailure()). 
Future<Either<Failure,Unit>> sendRecoveryAccountEmail(String email);

/// Returns Right(unit) in case everything works properly. If newPassword is not properly formatted, will return Left(InvalidPasswordFormatFailure()). If currentPassword it's wrong, will return Left(InvalidPasswordFailure()). 
Future<Either<Failure,Unit>> changePassword(String currentPassword, String newPassword);
 ```

### Authentication UI

En la parte de la UI, tendremos 13 pantallas segun la distribucion diseñada en Figma, aunque hay pantallas que creo que son la misma pero con un cambio de estado. Aqui pueden validar la data a nivel de UI, aunque a nivel de dominio se va a hacer igual. En los blocs, tendran un estado [*ErrorState] el cual tendra dentro una variable String? XError la cual refleja que la variable X tiene un error.

## My profile

Este feature es el encargado de la edicion y visualizacion de mi perfil.

### My profile usecases
```dart
/// Gets my Profile. Returns a [MyProfile] entity in case everything works properly.
Future<Either<Failure,MyProfile>> getMyProfile();

/// Updates my profile given a [MyProfileEditableParams] params to edit.
Future<Either<Failure,MyProfile>> updateMyProfile(MyProfileEditableParams params);
```

### MyProfileUI

En UI se encuentra un apartado Mi Perfil en el cual estan todos los datos del perfil. Estos datos aparecen dentro de un TextField, asi q no se si al tocarlo pasaria a una pantalla de edicion de un solo dato, o como se gestionaria la edicion en general. Aqui habria que dejarar claro como funcionaria todo esto.

## Users

En Users se alojara todo lo relacionado con informacion de los users, no siendo asi las transferencias futuras P2P o transferencias en general. Para ello exisitira un feature dedicado solamente a las transferencias. Asumo que la informacion de userDetails seria diferente a la informacion de User en preview, aunque eso depende mas del backend y de que tan diferentes son en cuanto a funcionalidad estas entidades. Importante aqui saber q a pesar de que visualmente getUsers y getLatestsUsers se parecen, a nivel de domain no son iguales, asi q no deberiamos darles el mismo tratamiento. [PageResult<T>] es una clase definida para toda la app, la cual contiene una [List<T>] items y un [int] count que es el total de elementos del paginado. 

### Users usecases

```dart
Future<Either<Failure<User>>> getUsers(PaginationParams pagination);
Future<Either<Failure<PageResult<User>>>> getLatestUsers();
Future<Either<Failure<UserDetails>>> getUserById(String id);
```

### Users UI

Por ahora, creo q solamente estaria el componente del home y una pantalla dedicada a ver informacion sobre un usuario especifico. De anadirse alguna interaccion sobre un usuario, en caso de no traer grandes cambios, se almacenaria en este mismo scope.

## Services

Services seria muy similar a Users. Asumo que habria una pantalla dedicada a ver los detalles de un servicio aunque en diseno todavia no esta disponible.

### Services Usecases

```dart
Future<Either<Failure<Service>>> getServices(PaginationParams pagination);
Future<Either<Failure<List<Service>>>> getLatestServices();
Future<Either<Failure<PageResult<ServiceDetails>>>> getServiceById(String serviceId);
```

### Services UI

Homologamente a los users.

## Transactions

### Transactions usecases

```dart
/// Performs a GET request searching for pending transactions mathching the given parameters. 
Future<Either<Failure<PageResult<Transaction>>>> getPendingTransactions(String query, PaginationParams pagination, Filters filters);

/// Performs a GET request searching for completed transactions mathching the given parameters. 
Future<Either<Failure<PageResult<Transaction>>>> getCompletedTransactions(String query, PaginationParams pagination, Filters filters);
Future<Either<Failure<TransactionDetails>>> getTransactionById(String transactionId);

/// Performs a POST request sending a transaction to the [userId] user. Conversion should be done in server side. Returs Right(unit) if everything works properly.  
Future<Either<Failure,Unit>> sendTransaction(String userId, TypeOfCoin coin, double amount, String comment);
```

### Transactions UI

Tendriamos una pantalla dedicada a la vista de transacciones paginadas, con un tabBar para alternar entre pending y completed. Aqui revisar en diseno si a la hora de aplicar un filtro, se aplica a ambas pantallas o solo a una.

## Payments

Payments esta bastante unido al concepto de transactions, asi que en caso de que los clientes/desarrolladores prefieran unirlos se pueden unir, solo que dado que es el feature mas importante de la aplicacion, creo que deberiamos aislarlo lo mas posible. 

### Payments Usecases

```dart

Future<Either<Failure<PageResult<PaymentLink>>>> getPaymentsLinks(PaginationParams pagination);
Future<Either<Failure<PageResult<PaymentMethod>>>> getPaymentsMethods(PaginationParams pagination);
Future<Either<Failure<PaymentLink>>> createPaymentLink(PaymentParams paymentParams);
Future<Either<Failure<PaymentLink>>> createPaymentMethod(MethodParams methodParams);
Future<Either<Failure<List<PaymentType>>>> getPaymentTypes();

```

### Payments UI

La ui creo q si es bastante basica con respecto a esto. Creo q no tendremos mucho problema a lla hora de maquetar. De cualquier manera repito, todo lo que puedan validar a nivel de UI sera mejor ya que en caso de necesitar salir antes, podemos confiar un poco en esas validaciones aunque lo mejor es validar a nivel de domain para enriquecerlo. 

## Referral links

Se podria agregar al scope de "MyProfile" por su simpleza, aunque a nivel de contextos creo q deberian ir separados. Aqui ayudenme con el nombre tecnico para esto que no me suena mucho. Para hacer los links de referidos, recomiendo ver Dynamic links de Firebase. Son links a tu app que sobreviven al proceso de instalacion de la app, lo cual es genial ya que puedes instalarte la app y no tener que manualmente ingresar el link de referrido(cosa que nadie practicamente hace).

### Referral links usecases

```dart
/// Returns my link validated. [ReferralLink] is a class wich contains a String which is a valid URL. 
Future<Either<Failure,ReferralLink>> getMyLink();
Future<Either<Failure,UserReferreds>> getUsersReffered(PaginationParams params);
```

### Referral links UI

Aqui la cosa es bien sencilla tambien. Es practicamente una pagina en la que tendran toda la info. 


# Arquitectura

Recomiendo por la simpleza del proyecto no meternos en arquitecturas complejas que demoran en demasia el resultado final. En su lugar, propongo usar algo similar al patron repository y depender un poco mas de infraestructura en vez de buscar proteger constantemente la comunicacion entre componentes. Por cada feature, tendremos 5 carpeticas: 

1. Presenter: donde se alojan los widgets y paginas(cada una en su carpetica aparte claro).
2. State-Manager: donde se alojan los diferentes gestores de estado usados en se contexto. No deberiamos nombrar blocs a la carpeta ya que no en todos los lugares usaremos bloc.
3. Models: aqui se alojan los modelos de nuestras entidades. Para elaborar los modelos, recomiendo usar freezed para asi ganar en expresividad y no perder mucho tiempo elaborando los models.
4. Repository: Aqui es donde hacemos el fetch a los objetos y actuamos en base a estos.
5. Data-sources: Aqui es donde tendremos nuestra conexion con la API y cache. Para generar la conexion con la API recomiendo usar Chopper con Dio, que funciona generalmente bien y es bastante estable. En la carpeta core hay un network http client pensado para hacer clean que es un poco menos suceptible al cambio de infraestructura, pero a la vez tendriamos que generar todo el codigo de comunicacion con las APIs. Yeikel queda un poco a decision tuya cual usamos. Para el tema de cache, solo en caso necesario, podriamos implementar Hive como base de datos. Igual yo tengo una implementacion de una base de datos generica para usar con clean, se las agrego al core en cuanto arranque el proyecto. Faltaria solamente hablar tema de tiempo, para ello creo q es necesario tener la API en las manos. Cualquier cosa q no les cuadre de lo que les expongo arriba lo cambiamos sin lio.