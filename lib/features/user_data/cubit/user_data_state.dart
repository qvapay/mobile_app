part of 'user_data_cubit.dart';

class UserDataState extends Equatable {
  const UserDataState({this.userData, this.errorMessaje});

  final UserData? userData;
  final String? errorMessaje;

  @override
  List<Object?> get props => [userData, errorMessaje];

  UserDataState copyWith({
    UserData? userData,
    String? errorMessaje,
  }) {
    return UserDataState(
      userData: userData ?? this.userData,
      errorMessaje: errorMessaje ?? this.errorMessaje,
    );
  }
}

// class UserDataLoading extends UserDataState {
//   const UserDataLoading();

//   @override
//   List<Object> get props => [];
// }

// class UserDataLoaded extends UserDataState {
//   const UserDataLoaded({required this.userData});

//   final UserData userData;

//   @override
//   List<Object> get props => [userData];
// }

// class UserDataError extends UserDataState {
//   const UserDataError({this.message});

//   final String? message;

//   @override
//   List<Object?> get props => [message];
// }
