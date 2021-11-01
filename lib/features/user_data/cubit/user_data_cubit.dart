import 'package:equatable/equatable.dart';
import 'package:hydrated_bloc/hydrated_bloc.dart';
import 'package:mobile_app/core/error/failures.dart';
import 'package:mobile_app/features/user_data/models/models.dart';
import 'package:mobile_app/features/user_data/repository/user_data_repository.dart';
import 'package:mobile_app/features/user_data/user_data.dart';

part 'user_data_state.dart';

class UserDataCubit extends HydratedCubit<UserDataState> {
  UserDataCubit({
    required IUserDataRepository userDataRepository,
  })  : _userDataRepository = userDataRepository,
        super(UserDataStateLoading());

  final IUserDataRepository _userDataRepository;

  Future<void> getUserData({required DateTime saveDateLastLogIn}) async {
    final result = await _userDataRepository.getUserData(
      saveDateLastLogIn: saveDateLastLogIn,
    );

    emit(
      result.fold(
        (failure) => UserDataStateError(
          message: (failure is ServerFailure)
              ? failure.message
              : const AuthenticationFailure().message,
        ),
        (userData) => UserDataStateLoaded(userData: userData),
      ),
    );
  }

  @override
  UserDataState? fromJson(Map<String, dynamic> json) {
    if (json.isEmpty) return UserDataStateError(message: 'Empty Cache');
    return UserDataStateLoaded(userData: UserData.fromJson(json));
  }

  @override
  Map<String, dynamic>? toJson(UserDataState state) {
    if (state is UserDataStateLoaded) {
      return state.userData.toJson();
    }
    return <String, dynamic>{};
  }
}
